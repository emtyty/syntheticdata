/**
 * ZIP export using `archiver` — streams directly to the response without
 * buffering the full archive in memory (unlike the old JSZip approach).
 */

import archiver from 'archiver';
import type { Readable } from 'stream';
import type { DatasetSchema } from '../types/index.js';
import { jsonlToCsvStream, jsonlToJsonStream, jsonlToSqlStream } from '../routes/export.routes.js';

export type ZipFormat = 'csv' | 'json' | 'sql';

function tableStream(filePath: string, tableName: string, format: ZipFormat): Readable {
  switch (format) {
    case 'json': return jsonlToJsonStream(filePath, false);
    case 'sql':  return jsonlToSqlStream(filePath, tableName);
    default:     return jsonlToCsvStream(filePath, true);
  }
}

/**
 * Build a streaming ZIP archive from per-table JSONL result files.
 * Returns an `archiver.Archiver` (a Readable stream) that Fastify can
 * send directly via `reply.send(archive)`.
 *
 * @param tables       Project table definitions (for name lookup)
 * @param resultPaths  tableId → JSONL file path
 * @param format       Output format inside the ZIP
 */
export function buildZip(
  tables: DatasetSchema[],
  resultPaths: Record<string, string>,
  format: ZipFormat = 'csv',
): archiver.Archiver {
  const tableById = new Map(tables.map(t => [t.id, t]));
  const archive = archiver('zip', { zlib: { level: 6 } });

  for (const [tableId, filePath] of Object.entries(resultPaths)) {
    const table = tableById.get(tableId);
    if (!table) continue;
    const safeName = table.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const ext = format === 'json' ? 'json' : format === 'sql' ? 'sql' : 'csv';
    archive.append(tableStream(filePath, table.name, format), { name: `${safeName}.${ext}` });
  }

  archive.finalize();
  return archive;
}
