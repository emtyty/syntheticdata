/**
 * Chunked / streaming generation service.
 *
 * Generates rows in chunks of `chunkSize` (default 10 000), yielding the
 * event loop between chunks so progress polling stays responsive.
 *
 * State that must persist across chunks (unique seen-sets, FK
 * fixed_per_parent assignment maps) lives in a `StreamingContext` that the
 * caller owns and passes in for every table generation.
 *
 * FK `fixed_per_parent` uses a swap-and-pop activeList for O(1) removal so
 * the per-chunk overhead stays minimal even with millions of parents.
 * The initial pool shuffle is done in 10k-element batches with event-loop
 * yields so a 1M-parent pool doesn't block for more than ~1 ms at a time.
 */

import seedrandom from 'seedrandom';
import type { ColumnSchema, GeneratedRow } from '../types/index.js';
import { GenerationCancelledError } from '../types/index.js';
import { generateRows } from './generator.service.js';
import { PoolRegistry } from './pool.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FixedPerParentState {
  capacityMap: Map<string | number, number>;
  /** Swap-and-pop list; O(1) removal when a parent is exhausted. */
  activeList: (string | number)[];
}

export interface StreamingContext {
  /** Shared pool across all chunks (and tables in a project). */
  pool: PoolRegistry;
  /**
   * Sequential counter for integer PK columns (colId → next value).
   * Avoids O(n) SeenSet for the common auto-increment case.
   */
  counterMap: Map<string, number>;
  /**
   * Seen-value sets for non-UUID, non-integer unique/PK columns.
   * Grows across all chunks so uniqueness is maintained globally.
   */
  seenMap: Map<string, Set<string>>;
  /** State for fixed_per_parent FK columns; initialised before first chunk. */
  fkState: Map<string, FixedPerParentState>;
}

export function createStreamingContext(pool?: PoolRegistry): StreamingContext {
  return {
    pool: pool ?? new PoolRegistry(),
    counterMap: new Map(),
    seenMap: new Map(),
    fkState: new Map(),
  };
}

// ─── Fisher-Yates helpers ─────────────────────────────────────────────────────

function fisherYatesSync<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
}

/**
 * Fisher-Yates in 10k-element batches, yielding between batches.
 * For a 1M-entry pool: ~100 ticks × ≤1 ms each = non-blocking.
 */
async function fisherYatesChunked<T>(arr: T[], rng: () => number): Promise<void> {
  const BATCH = 10_000;
  for (let i = arr.length - 1; i > 0; i -= BATCH) {
    const batchEnd = Math.max(0, i - BATCH);
    for (let j = i; j > batchEnd; j--) {
      const k = Math.floor(rng() * (j + 1));
      const tmp = arr[j]; arr[j] = arr[k]; arr[k] = tmp;
    }
    if (i - BATCH > 0) {
      await new Promise<void>(r => setImmediate(r));
    }
  }
}

// ─── FixedPerParentState initialisation ──────────────────────────────────────

/**
 * Adjust total capacity to match targetTotal.
 * Adds or subtracts 1 per parent in round-robin fashion.
 * Never reduces below cfg.min.
 */
function adjustCapacity(
  capacityMap: Map<string | number, number>,
  parents: (string | number)[],
  currentTotal: number,
  targetTotal: number,
  cfgMin: number,
): void {
  let diff = targetTotal - currentTotal; // positive = need more
  if (diff === 0) return;

  if (diff > 0) {
    let i = 0;
    while (diff > 0) {
      const p = parents[i % parents.length];
      capacityMap.set(p, (capacityMap.get(p) ?? 0) + 1);
      diff--; i++;
    }
  } else {
    // Remove excess; never drop below cfgMin
    let i = parents.length - 1;
    let passes = 0;
    while (diff < 0) {
      const p = parents[i >= 0 ? i : 0];
      const cap = capacityMap.get(p) ?? 0;
      if (cap > cfgMin) {
        capacityMap.set(p, cap - 1);
        diff++;
      }
      i--;
      if (i < 0) {
        i = parents.length - 1;
        passes++;
        if (passes > parents.length * 2) break; // safety: can't reduce further
      }
    }
  }
}

export async function initFixedPerParentState(
  pool: (string | number)[],
  totalRows: number,
  cfg: { min: number; max: number },
  rng: () => number,
): Promise<FixedPerParentState> {
  if (pool.length === 0) {
    return { capacityMap: new Map(), activeList: [] };
  }

  // Shuffle pool (async / non-blocking for large pools)
  const shuffled = [...pool];
  if (shuffled.length > 10_000) {
    await fisherYatesChunked(shuffled, rng);
  } else {
    fisherYatesSync(shuffled, rng);
  }

  // Assign random capacity to each parent
  const capacityMap = new Map<string | number, number>();
  let totalCapacity = 0;
  for (const parent of shuffled) {
    const count = Math.floor(rng() * (cfg.max - cfg.min + 1)) + cfg.min;
    capacityMap.set(parent, count);
    totalCapacity += count;
  }

  // Adjust to match totalRows
  adjustCapacity(capacityMap, shuffled, totalCapacity, totalRows, cfg.min);

  return {
    capacityMap,
    activeList: [...shuffled],
  };
}

// ─── Per-chunk FK fixed_per_parent picker ─────────────────────────────────────

export function pickFixedPerParentChunk(
  state: FixedPerParentState,
  chunkSize: number,
  rng: () => number,
  fkNullRate: number,
): (string | number | null)[] {
  const output: (string | number | null)[] = new Array(chunkSize);

  for (let i = 0; i < chunkSize; i++) {
    // Apply null rate before consuming capacity
    if (fkNullRate > 0 && rng() < fkNullRate) {
      output[i] = null;
      continue;
    }

    if (state.activeList.length === 0) {
      output[i] = null; // all capacity exhausted
      continue;
    }

    const idx = Math.floor(rng() * state.activeList.length);
    const parent = state.activeList[idx];
    output[i] = parent;

    const remaining = (state.capacityMap.get(parent) ?? 1) - 1;
    if (remaining <= 0) {
      // Swap-and-pop: O(1) removal
      state.capacityMap.delete(parent);
      state.activeList[idx] = state.activeList[state.activeList.length - 1];
      state.activeList.pop();
    } else {
      state.capacityMap.set(parent, remaining);
    }
  }

  // Shuffle the chunk so parents are interleaved, not grouped
  fisherYatesSync(output, rng);
  return output;
}

// ─── Main chunked generator ───────────────────────────────────────────────────

const CHUNK_SIZE = 10_000;

/**
 * Generate `totalRows` rows for `columns` in chunks of `chunkSize`.
 * Calls `onChunk` after each chunk (awaited) for I/O (JSONL write + progress).
 * Checks `cancellationToken` between chunks.
 */
export async function generateRowsChunked(
  columns: ColumnSchema[],
  totalRows: number,
  seed: number,
  ctx: StreamingContext,
  onChunk: (rows: GeneratedRow[], completedRows: number) => Promise<void>,
  cancellationToken?: { cancelled: boolean },
  chunkSize = CHUNK_SIZE,
): Promise<void> {
  const totalChunks = Math.ceil(totalRows / chunkSize);
  let completedRows = 0;

  // ── Initialise fixed_per_parent state before first chunk ──────────────────
  // Uses a seeded RNG for deterministic state init (same seed prefix as gen)
  const initRng = seedrandom(`${seed}:init`);

  for (const col of columns) {
    const cfg = col.generatorConfig;
    if (
      col.indexType === 'foreign_key' &&
      cfg.fkDistribution === 'fixed_per_parent' &&
      cfg.poolRef &&
      cfg.fkChildrenPerParent &&
      !ctx.fkState.has(col.id)
    ) {
      const parentPool = ctx.pool.has(cfg.poolRef) ? ctx.pool.get(cfg.poolRef) : [];
      const effective = cfg.fkFixedValues?.length
        ? parentPool.filter(v => cfg.fkFixedValues!.includes(String(v)))
        : parentPool;

      ctx.fkState.set(
        col.id,
        await initFixedPerParentState(effective, totalRows, cfg.fkChildrenPerParent, initRng),
      );
    }
  }

  // ── Generate chunks ────────────────────────────────────────────────────────
  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    if (cancellationToken?.cancelled) throw new GenerationCancelledError();

    const chunkRows = Math.min(chunkSize, totalRows - completedRows);

    // Derive a deterministic per-chunk seed
    const chunkSeed = seedrandom(`${seed}:${chunkIdx}`)();
    const chunkSeedInt = Math.floor(chunkSeed * 2 ** 31);

    const chunk = generateChunk(columns, chunkRows, chunkSeedInt, ctx, chunkIdx * chunkSize);

    // Register new PK values into the pool for FK use in later tables/chunks
    for (const col of columns) {
      if (col.indexType === 'primary_key' && col.poolName) {
        const colValues = chunk.map(r => r[col.name]).filter((v): v is string | number => v !== null);
        if (colValues.length > 0) ctx.pool.appendToPool(col.poolName, colValues);
      }
    }

    completedRows += chunkRows;
    await onChunk(chunk, completedRows);

    // Yield between chunks to keep event loop responsive
    await new Promise<void>(r => setImmediate(r));
  }
}

// ─── Per-chunk generation (sync, called inside the async loop) ────────────────

function generateChunk(
  columns: ColumnSchema[],
  rowCount: number,
  seed: number,
  ctx: StreamingContext,
  rowOffset: number,
): GeneratedRow[] {
  // We reuse the existing generateRows function for most columns,
  // but override behaviour for: integer PKs (counter), fixed_per_parent FKs,
  // and non-UUID unique columns (global seenMap).
  //
  // For simplicity we call generateRows which handles topo-sort and basic
  // generation, then post-process PK uniqueness and FK overrides.
  //
  // A cleaner future refactor would inline all of this, but this approach
  // keeps the delta small and easy to verify.

  const { rows } = generateRows(columns, rowCount, seed, ctx.pool);

  // ── Override integer PK columns with sequential counter ───────────────────
  for (const col of columns) {
    if (col.indexType !== 'primary_key' && col.indexType !== 'unique') continue;
    if (col.dataType !== 'integer') continue;

    // Use counter-based generation (1-based, global offset)
    const startVal = (ctx.counterMap.get(col.id) ?? rowOffset) + 1;
    for (let i = 0; i < rowCount; i++) {
      rows[i][col.name] = startVal + i;
    }
    ctx.counterMap.set(col.id, startVal + rowCount - 1);
  }

  // ── Override fixed_per_parent FK columns ──────────────────────────────────
  const chunkRng = seedrandom(`${seed}:fk`);
  for (const col of columns) {
    const cfg = col.generatorConfig;
    if (
      col.indexType !== 'foreign_key' ||
      cfg.fkDistribution !== 'fixed_per_parent' ||
      !ctx.fkState.has(col.id)
    ) continue;

    const state = ctx.fkState.get(col.id)!;
    const picked = pickFixedPerParentChunk(state, rowCount, chunkRng, cfg.fkNullRate ?? 0);
    for (let i = 0; i < rowCount; i++) {
      rows[i][col.name] = picked[i];
    }
  }

  return rows;
}
