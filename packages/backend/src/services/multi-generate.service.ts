/**
 * Multi-table generation service.
 * Generates all tables in a project in topological order (FK dependencies first),
 * sharing a single global PoolRegistry so cross-table FK references work.
 */

import { nanoid } from 'nanoid';
import seedrandom from 'seedrandom';
import type { DatasetSchema, GeneratedRow, TableRowConfig } from '../types/index.js';
import { generateRows } from './generator.service.js';
import { PoolRegistry } from './pool.service.js';

// ─── Cross-table topological sort ─────────────────────────────────────────────

function topoSortTables(tables: DatasetSchema[]): DatasetSchema[] {
  const byName = new Map(tables.map(t => [t.name, t]));
  const visited = new Set<string>();
  const result: DatasetSchema[] = [];

  function visit(table: DatasetSchema) {
    if (visited.has(table.name)) return;
    visited.add(table.name);

    // Collect referenced table names via FK poolRef ("TableName.col")
    for (const col of table.columns) {
      if (col.indexType === 'foreign_key' && col.generatorConfig.poolRef) {
        const refTableName = col.generatorConfig.poolRef.split('.')[0];
        const dep = byName.get(refTableName);
        if (dep && dep.name !== table.name) visit(dep);
      }
    }
    result.push(table);
  }

  for (const t of tables) visit(t);
  return result;
}

// ─── Main multi-table generator ───────────────────────────────────────────────

export function generateProject(
  tables: DatasetSchema[],
  tableConfigs: TableRowConfig[],
  seed: number,
): Record<string, GeneratedRow[]> {
  const rowCountMap = new Map(tableConfigs.map(c => [c.tableId, c.rowCount]));
  const sorted = topoSortTables(tables);
  const globalPool = new PoolRegistry();
  const results: Record<string, GeneratedRow[]> = {};

  // Use sequential seeds derived from the master seed so each table is
  // reproducible independently but also the whole set is deterministic.
  const rng = seedrandom(String(seed));
  const tableSeed = () => Math.floor(rng() * 2 ** 31);

  for (const table of sorted) {
    const rowCount = rowCountMap.get(table.id) ?? 100;
    // Pass globalPool so FK columns can pick from PKs already generated
    const { rows } = generateRows(table.columns, rowCount, tableSeed(), globalPool);
    results[table.id] = rows;
  }

  return results;
}
