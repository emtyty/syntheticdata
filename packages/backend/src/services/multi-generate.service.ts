/**
 * Multi-table generation service.
 *
 * Phase 2: Kahn's algorithm replaces the old recursive DFS so cycle detection
 * is iterative (no stack-overflow risk) and tables at the same dependency level
 * are generated in parallel.
 *
 * Phase 4: Uses generateRowsChunked so each table's rows are written to JSONL
 * temp files in 10k-row chunks — memory stays bounded regardless of row count.
 */

import seedrandom from 'seedrandom';
import type { DatasetSchema, TableRowConfig } from '../types/index.js';
import { CircularDependencyError } from '../types/index.js';
import type { GeneratedRow } from '../types/index.js';
import { generateRowsChunked, createStreamingContext } from './streaming-generator.service.js';
import { PoolRegistry } from './pool.service.js';

// ─── Pre-validation ───────────────────────────────────────────────────────────

function validatePoolRefs(tables: DatasetSchema[]): void {
  const tableNames = new Set(tables.map(t => t.name));
  const missing: string[] = [];

  for (const table of tables) {
    for (const col of table.columns) {
      if (col.indexType === 'foreign_key' && col.generatorConfig.poolRef) {
        const refTableName = col.generatorConfig.poolRef.split('.')[0];
        // Self-refs are fine; external refs must exist in the project
        if (refTableName !== table.name && !tableNames.has(refTableName)) {
          missing.push(`${table.name}.${col.name} → "${col.generatorConfig.poolRef}"`);
        }
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `FK poolRef targets not found in this project:\n${missing.map(m => `  • ${m}`).join('\n')}`,
    );
  }
}

// ─── Kahn's topological sort → dependency levels ─────────────────────────────

/**
 * Returns tables grouped into dependency levels.
 * Tables at the same level have no FK relationships between them and can
 * be generated in parallel. Tables in level[n+1] depend on level[n].
 * Throws CircularDependencyError if a cycle is detected.
 */
function topoSortTablesWithLevels(tables: DatasetSchema[]): DatasetSchema[][] {
  const byId = new Map(tables.map(t => [t.id, t]));
  const byName = new Map(tables.map(t => [t.name, t]));

  // Build: tableId → Set<tableId it depends on>
  const deps = new Map<string, Set<string>>(tables.map(t => [t.id, new Set()]));
  // Reverse: tableId → Set<tableIds that depend on it>
  const revDeps = new Map<string, Set<string>>(tables.map(t => [t.id, new Set()]));

  for (const table of tables) {
    for (const col of table.columns) {
      if (col.indexType !== 'foreign_key' || !col.generatorConfig.poolRef) continue;
      const refName = col.generatorConfig.poolRef.split('.')[0];
      if (refName === table.name) continue; // self-ref: OK, exclude from edges
      const dep = byName.get(refName);
      if (!dep) continue; // unknown ref — caught by validatePoolRefs
      deps.get(table.id)!.add(dep.id);
      revDeps.get(dep.id)!.add(table.id);
    }
  }

  // In-degree map
  const inDegree = new Map<string, number>(
    tables.map(t => [t.id, deps.get(t.id)!.size]),
  );

  const levels: DatasetSchema[][] = [];
  let queue = tables.filter(t => inDegree.get(t.id) === 0);

  while (queue.length > 0) {
    levels.push([...queue]);
    const nextQueue: DatasetSchema[] = [];
    for (const table of queue) {
      for (const dependentId of revDeps.get(table.id) ?? []) {
        const newDeg = (inDegree.get(dependentId) ?? 1) - 1;
        inDegree.set(dependentId, newDeg);
        if (newDeg === 0) nextQueue.push(byId.get(dependentId)!);
      }
    }
    queue = nextQueue;
  }

  // Cycle check: all tables must appear in some level
  const processed = levels.flat().length;
  if (processed < tables.length) {
    const remaining = tables.filter(
      t => !levels.flat().find(lt => lt.id === t.id),
    );
    throw new CircularDependencyError(remaining.map(t => t.name));
  }

  return levels;
}

// ─── Main multi-table generator ───────────────────────────────────────────────

/**
 * Generate all tables in a project using chunked streaming.
 * Tables at the same dependency level are generated in parallel (Promise.all).
 *
 * @param onTableChunk  Called per chunk per table; use to write JSONL + update progress.
 * @returns             Map of tableId → JSONL file path (set by the caller via the callback pattern below)
 */
export async function generateProject(
  tables: DatasetSchema[],
  tableConfigs: TableRowConfig[],
  seed: number,
  onTableChunk: (
    tableId: string,
    rows: GeneratedRow[],
    completedRows: number,
    totalRows: number,
  ) => Promise<void>,
  cancellationToken?: { cancelled: boolean },
): Promise<void> {
  // Heal PK poolNames that were saved without the "TableName." prefix
  // (older projects created via the diagram's Add-Table form). FK poolRefs
  // and the dropdown UI both use the qualified form.
  tables = tables.map(t => ({
    ...t,
    columns: t.columns.map(c =>
      c.indexType === 'primary_key' && c.poolName && !c.poolName.includes('.')
        ? { ...c, poolName: `${t.name}.${c.poolName}` }
        : c,
    ),
  }));

  validatePoolRefs(tables);

  const levels = topoSortTablesWithLevels(tables);
  const rowCountMap = new Map(tableConfigs.map(c => [c.tableId, c.rowCount]));

  // Single shared pool so FK columns reference PKs from other tables
  const sharedPool = new PoolRegistry();
  const masterRng = seedrandom(String(seed));
  const tableSeed = () => Math.floor(masterRng() * 2 ** 31);

  for (const level of levels) {
    // All tables in this level are independent — generate in parallel
    await Promise.all(
      level.map(async (table) => {
        const totalRows = rowCountMap.get(table.id) ?? 100;
        const tSeed = tableSeed();

        // Each table in a level gets its own StreamingContext but shares the
        // global pool so cross-table FK refs work across levels.
        const ctx = createStreamingContext(sharedPool);

        await generateRowsChunked(
          table.columns,
          totalRows,
          tSeed,
          ctx,
          async (rows, completedRows) => {
            await onTableChunk(table.id, rows, completedRows, totalRows);
          },
          cancellationToken,
        );
      }),
    );
  }
}
