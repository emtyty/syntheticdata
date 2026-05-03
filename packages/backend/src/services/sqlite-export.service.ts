/**
 * Build a SQLite .db file from per-table JSONL result files.
 * Uses better-sqlite3 (already a project dependency).
 * Rows are inserted in bulk transactions for speed; memory stays bounded
 * because rows are read from JSONL line-by-line via readline.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import readline from 'readline';
import type { DatasetSchema } from '../types/index.js';

// ─── SQLite type inference ────────────────────────────────────────────────────

function inferSqliteType(value: unknown): string {
  if (value === null || value === undefined) return 'TEXT';
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'REAL';
  if (typeof value === 'boolean') return 'INTEGER';
  return 'TEXT';
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Build a SQLite database file at `outPath` from per-table JSONL result files.
 * Safe to call multiple times — will overwrite the existing file.
 */
export async function buildSqliteDb(
  tables: DatasetSchema[],
  resultPaths: Record<string, string>, // tableId → JSONL path
  outPath: string,
): Promise<void> {
  // Remove existing file so we start clean
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

  const db = new Database(outPath);
  db.pragma('journal_mode = WAL');

  try {
    for (const table of tables) {
      const filePath = resultPaths[table.id];
      if (!filePath || !fs.existsSync(filePath)) continue;

      // ── Peek at the first row to learn column names + types ──────────────
      let columns: string[] = [];
      let colTypes: string[] = [];

      await new Promise<void>((resolve, reject) => {
        const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
        rl.on('line', (line) => {
          if (!line.trim()) return;
          const firstRow = JSON.parse(line) as Record<string, unknown>;
          columns = Object.keys(firstRow);
          colTypes = columns.map(c => inferSqliteType(firstRow[c]));
          rl.close();
        });
        rl.on('close', resolve);
        rl.on('error', reject);
      });

      if (columns.length === 0) continue;

      // ── Create table ─────────────────────────────────────────────────────
      const tableName = table.name.replace(/[^a-zA-Z0-9_]/g, '_');
      const colDefs = columns.map((c, i) => `"${c.replace(/"/g, '""')}" ${colTypes[i]}`).join(', ');
      db.exec(`CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs})`);

      // ── Bulk insert via transaction ───────────────────────────────────────
      const placeholders = columns.map(() => '?').join(', ');
      const colNames = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(', ');
      const insert = db.prepare(`INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`);

      const insertMany = db.transaction((rows: unknown[][]) => {
        for (const row of rows) insert.run(row);
      });

      const BATCH = 1000;
      let batch: unknown[][] = [];

      await new Promise<void>((resolve, reject) => {
        const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
        rl.on('line', (line) => {
          if (!line.trim()) return;
          const row = JSON.parse(line) as Record<string, unknown>;
          batch.push(columns.map(c => {
            const v = row[c];
            if (v === null || v === undefined) return null;
            if (typeof v === 'boolean') return v ? 1 : 0;
            return v;
          }));
          if (batch.length >= BATCH) {
            insertMany(batch);
            batch = [];
          }
        });
        rl.on('close', () => {
          if (batch.length > 0) insertMany(batch);
          resolve();
        });
        rl.on('error', reject);
      });
    }
  } finally {
    db.close();
  }
}
