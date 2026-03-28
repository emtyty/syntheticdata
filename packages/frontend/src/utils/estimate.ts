/**
 * Pure utility: estimate child table row counts based on fixed_per_parent config.
 * No network calls — all data comes from the Zustand project store.
 */

import type { DatasetSchema } from '../types/index.js';

/**
 * Estimate expected child rows for a table that has FK columns configured
 * with `fixed_per_parent`. Returns null if no such FK column exists.
 *
 * When multiple FK columns use fixed_per_parent, returns the maximum estimate
 * across all of them (the FK column that "drives" the most rows).
 *
 * @param table      The child table
 * @param allTables  All tables in the project
 * @param rowCounts  Current planned row count per tableId
 */
export function estimateChildRowCount(
  table: DatasetSchema,
  allTables: DatasetSchema[],
  rowCounts: Record<string, number>,
): number | null {
  const tableByName = new Map(allTables.map(t => [t.name, t]));
  let maxEstimate: number | null = null;

  for (const col of table.columns) {
    const cfg = col.generatorConfig;
    if (
      col.indexType !== 'foreign_key' ||
      cfg.fkDistribution !== 'fixed_per_parent' ||
      !cfg.poolRef ||
      !cfg.fkChildrenPerParent
    ) continue;

    const parentTableName = cfg.poolRef.split('.')[0];
    const parentTable = tableByName.get(parentTableName);
    if (!parentTable) continue;

    const parentRows = rowCounts[parentTable.id] ?? 100;
    const avg = (cfg.fkChildrenPerParent.min + cfg.fkChildrenPerParent.max) / 2;
    const estimate = Math.round(parentRows * avg);

    if (maxEstimate === null || estimate > maxEstimate) {
      maxEstimate = estimate;
    }
  }

  return maxEstimate;
}

/** Format a number with locale commas: 1000000 → "1,000,000" */
export function fmtNum(n: number): string {
  return n.toLocaleString();
}
