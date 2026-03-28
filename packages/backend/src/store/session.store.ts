/**
 * Persistent store backed by SQLite (better-sqlite3).
 * Drop-in replacement for the old in-memory Maps.
 * JSON blobs hold the full object; status/progress/result_path are
 * denormalized columns for lightweight polling queries.
 */

import type { DatasetSchema, GenerationJob, Project } from '../types/index.js';
import { db, maybeCheckpoint } from '../db/database.js';

// ─── Schema store ─────────────────────────────────────────────────────────────

export const schemaStore = {
  set(schema: DatasetSchema): void {
    db.prepare(`
      INSERT INTO schemas (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data       = excluded.data,
        updated_at = excluded.updated_at
    `).run(schema.id, JSON.stringify(schema), schema.createdAt, schema.updatedAt);
  },

  get(id: string): DatasetSchema | undefined {
    const row = db.prepare(`SELECT data FROM schemas WHERE id = ?`).get(id) as
      { data: string } | undefined;
    return row ? (JSON.parse(row.data) as DatasetSchema) : undefined;
  },

  list(): DatasetSchema[] {
    return (db.prepare(`SELECT data FROM schemas ORDER BY created_at DESC`).all() as
      Array<{ data: string }>).map(r => JSON.parse(r.data) as DatasetSchema);
  },

  delete(id: string): void {
    db.prepare(`DELETE FROM schemas WHERE id = ?`).run(id);
  },
};

// ─── Project store ────────────────────────────────────────────────────────────

export const projectStore = {
  set(p: Project): void {
    db.prepare(`
      INSERT INTO projects (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data       = excluded.data,
        updated_at = excluded.updated_at
    `).run(p.id, JSON.stringify(p), p.createdAt, p.updatedAt);
  },

  get(id: string): Project | undefined {
    const row = db.prepare(`SELECT data FROM projects WHERE id = ?`).get(id) as
      { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Project) : undefined;
  },

  list(): Project[] {
    return (db.prepare(`SELECT data FROM projects ORDER BY created_at DESC`).all() as
      Array<{ data: string }>).map(r => JSON.parse(r.data) as Project);
  },

  delete(id: string): void {
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  },
};

// ─── Job store ────────────────────────────────────────────────────────────────

export const jobStore = {
  set(job: GenerationJob): void {
    db.prepare(`
      INSERT INTO jobs (id, data, status, progress, result_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data        = excluded.data,
        status      = excluded.status,
        progress    = excluded.progress,
        result_path = excluded.result_path
    `).run(
      job.id,
      JSON.stringify(job),
      job.status,
      job.progress,
      job.resultPath ?? null,
      job.createdAt,
    );
  },

  get(id: string): GenerationJob | undefined {
    const row = db.prepare(`SELECT data FROM jobs WHERE id = ?`).get(id) as
      { data: string } | undefined;
    return row ? (JSON.parse(row.data) as GenerationJob) : undefined;
  },

  /** Merge patch into stored job; updates denormalized columns automatically. */
  update(id: string, patch: Partial<GenerationJob>): void {
    const row = db.prepare(`SELECT data FROM jobs WHERE id = ?`).get(id) as
      { data: string } | undefined;
    if (!row) return;

    const merged: GenerationJob = { ...JSON.parse(row.data), ...patch };
    db.prepare(`
      UPDATE jobs
      SET data = ?, status = ?, progress = ?, result_path = ?
      WHERE id = ?
    `).run(
      JSON.stringify(merged),
      merged.status,
      merged.progress,
      merged.resultPath ?? null,
      id,
    );
    maybeCheckpoint();
  },

  getResultPath(id: string): string | null {
    const row = db.prepare(`SELECT result_path FROM jobs WHERE id = ?`).get(id) as
      { result_path: string | null } | undefined;
    return row?.result_path ?? null;
  },

  list(): GenerationJob[] {
    return (db.prepare(`SELECT data FROM jobs ORDER BY created_at DESC`).all() as
      Array<{ data: string }>).map(r => JSON.parse(r.data) as GenerationJob);
  },
};
