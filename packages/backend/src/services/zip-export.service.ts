/**
 * ZIP export service.
 * Bundles per-table generated data into a single ZIP file.
 */

import JSZip from 'jszip';
import type { DatasetSchema, GeneratedRow } from '../types/index.js';
import { toCsv, toJson, toSqlInserts } from './export.service.js';

export type ZipFormat = 'csv' | 'json' | 'sql';

export async function buildZip(
  tables: DatasetSchema[],
  results: Record<string, GeneratedRow[]>,
  format: ZipFormat,
): Promise<Buffer> {
  const zip = new JSZip();

  // Sort tables in the results order (same order as tables array)
  for (const table of tables) {
    const rows = results[table.id] ?? [];
    const safeName = table.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();

    if (format === 'csv') {
      zip.file(`${safeName}.csv`, toCsv(rows, true));
    } else if (format === 'json') {
      zip.file(`${safeName}.json`, toJson(rows, true));
    } else {
      zip.file(`${safeName}.sql`, toSqlInserts(rows, table.name));
    }
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
