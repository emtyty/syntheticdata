/**
 * Export service.
 * Converts GeneratedRow[] to CSV, JSON, or SQL INSERT strings.
 */

import type { GeneratedRow } from '../types/index.js';

function escape(val: string | number | boolean | null): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  // Escape single quotes for SQL
  return `'${String(val).replace(/'/g, "''")}'`;
}

function csvCell(val: string | number | boolean | null): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  // Quote if contains comma, newline, or double-quote
  if (s.includes(',') || s.includes('\n') || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: GeneratedRow[], includeHeader = true): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines: string[] = [];
  if (includeHeader) lines.push(headers.join(','));
  for (const row of rows) {
    lines.push(headers.map(h => csvCell(row[h])).join(','));
  }
  return lines.join('\n');
}

export function toJson(rows: GeneratedRow[], pretty = false): string {
  return JSON.stringify(rows, null, pretty ? 2 : undefined);
}

export function toSqlInserts(rows: GeneratedRow[], tableName: string): string {
  if (rows.length === 0) return `-- No rows generated\n`;
  const headers = Object.keys(rows[0]);
  const colList = headers.map(h => `"${h}"`).join(', ');

  const chunkSize = 500;
  const lines: string[] = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const valuesList = chunk
      .map(row => `  (${headers.map(h => escape(row[h])).join(', ')})`)
      .join(',\n');
    lines.push(`INSERT INTO "${tableName}" (${colList}) VALUES\n${valuesList};\n`);
  }

  return lines.join('\n');
}
