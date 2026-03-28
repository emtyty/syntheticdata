import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import fs from 'fs';
import Database from 'better-sqlite3';
import { projectStore, jobStore } from '../store/session.store.js';
import { parsePrismaSchema } from '../services/prisma-parser.service.js';
import { parseSQLMultiple } from '../services/sql-parser.service.js';
import { generateProject } from '../services/multi-generate.service.js';
import { appendJsonlChunk, readJsonlRows, jobTempPath, getTempDir } from '../services/tempfile.service.js';
import { buildSqliteDb } from '../services/sqlite-export.service.js';
import { GenerationCancelledError } from '../types/index.js';
import type { DatasetSchema, Project, TableRowConfig } from '../types/index.js';

// ─── In-memory cancellation tokens ───────────────────────────────────────────

const cancellationTokens = new Map<string, { cancelled: boolean }>();

// ─── Zod schemas ───────────────────────────────────────────────────────────────

const GeneratorConfigZ = z.object({
  min: z.number().optional(), max: z.number().optional(), precision: z.number().optional(),
  dateFrom: z.string().optional(), dateTo: z.string().optional(),
  enumValues: z.array(z.string()).optional(), enumWeights: z.array(z.number()).optional(),
  minLength: z.number().optional(), maxLength: z.number().optional(),
  pattern: z.string().optional(), poolRef: z.string().optional(),
  poolSampling: z.enum(['uniform', 'weighted']).optional(),
  nullRate: z.number().min(0).max(1).optional(),
  fakerFn: z.string().optional(), locale: z.string().optional(),
  // Advanced FK controls (Phase 3)
  fkNullRate: z.number().min(0).max(1).optional(),
  fkDistribution: z.enum(['uniform', 'weighted', 'fixed_per_parent']).optional(),
  fkChildrenPerParent: z.object({ min: z.number().int().min(0), max: z.number().int().min(1) }).optional(),
  fkValueWeights: z.array(z.object({ value: z.string(), weight: z.number() })).optional(),
  fkFixedValues: z.array(z.string()).optional(),
});

const ColumnZ = z.object({
  id: z.string(), name: z.string().min(1),
  dataType: z.enum(['string','integer','float','boolean','date','datetime','uuid','email','phone','url','enum','regex']),
  indexType: z.enum(['primary_key','unique','foreign_key','none']),
  poolName: z.string().optional(), notNull: z.boolean(),
  generatorConfig: GeneratorConfigZ,
  sampleValues: z.array(z.string()).optional(),
});

const RuleConditionZ = z.object({
  column: z.string(), op: z.enum(['eq','neq','gt','lt','gte','lte','contains','is_null','is_not_null']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const RuleZ = z.object({
  id: z.string(), name: z.string().optional(),
  conditions: z.array(RuleConditionZ),
  actionColumn: z.string(),
  action: z.enum(['set_null','set_not_null','set_value','set_enum','set_range','derive_offset','derive_compute']),
  actionValue: z.unknown().optional(),
});

const TableZ = z.object({
  id: z.string(), name: z.string().min(1),
  columns: z.array(ColumnZ), rules: z.array(RuleZ),
  sourceType: z.enum(['upload','manual','sql','prisma']),
  createdAt: z.string(), updatedAt: z.string(),
});

const ProjectBodyZ = z.object({
  name: z.string().min(1),
  tables: z.array(TableZ),
});

// ─── Helper ────────────────────────────────────────────────────────────────────

function getProject(id: string, reply: FastifyReply): Project | null {
  const p = projectStore.get(id);
  if (!p) { reply.code(404).send({ ok: false, error: 'Project not found' }); return null; }
  return p;
}

// ─── Routes ────────────────────────────────────────────────────────────────────

export async function projectRoutes(app: FastifyInstance) {

  // List all projects
  app.get('/projects', async (_req, reply) => {
    reply.send({ ok: true, data: projectStore.list() });
  });

  // Get one project
  app.get<{ Params: { id: string } }>('/projects/:id', async (req, reply) => {
    const p = getProject(req.params.id, reply);
    if (p) reply.send({ ok: true, data: p });
  });

  // Create project
  app.post('/projects', async (req, reply) => {
    const parsed = ProjectBodyZ.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: parsed.error.message });
    const now = new Date().toISOString();
    const project: Project = {
      id: nanoid(),
      name: parsed.data.name,
      tables: parsed.data.tables as DatasetSchema[],
      createdAt: now,
      updatedAt: now,
    };
    projectStore.set(project);
    reply.code(201).send({ ok: true, data: project });
  });

  // Update project
  app.put<{ Params: { id: string } }>('/projects/:id', async (req, reply) => {
    const existing = getProject(req.params.id, reply);
    if (!existing) return;
    const parsed = ProjectBodyZ.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: parsed.error.message });
    const updated: Project = {
      ...existing,
      name: parsed.data.name,
      tables: parsed.data.tables as DatasetSchema[],
      updatedAt: new Date().toISOString(),
    };
    projectStore.set(updated);
    reply.send({ ok: true, data: updated });
  });

  // Delete project
  app.delete<{ Params: { id: string } }>('/projects/:id', async (req, reply) => {
    if (!projectStore.get(req.params.id)) {
      return reply.code(404).send({ ok: false, error: 'Project not found' });
    }
    projectStore.delete(req.params.id);
    reply.send({ ok: true });
  });

  // ── Import: Prisma schema ──────────────────────────────────────────────────

  app.post('/projects/infer/prisma', async (req, reply) => {
    const parsed = z.object({ source: z.string().min(1), name: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: parsed.error.message });
    try {
      const project = parsePrismaSchema(parsed.data.source, parsed.data.name);
      projectStore.set(project);
      reply.code(201).send({ ok: true, data: project });
    } catch (e) {
      reply.code(400).send({ ok: false, error: `Prisma parse error: ${(e as Error).message}` });
    }
  });

  // ── Import: multi-table SQL DDL ────────────────────────────────────────────

  app.post('/projects/infer/sql', async (req, reply) => {
    const parsed = z.object({ sql: z.string().min(1), name: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: parsed.error.message });
    try {
      const { tables: parsedTables, warnings } = parseSQLMultiple(parsed.data.sql);
      const now = new Date().toISOString();
      const tables: DatasetSchema[] = parsedTables.map(t => ({
        id: nanoid(),
        name: t.tableName,
        columns: t.columns.map(c => ({
          ...c,
          id: nanoid(),
          poolName: c.indexType === 'primary_key' ? `${t.tableName}.${c.name}` : undefined,
        })),
        rules: [],
        sourceType: 'sql' as const,
        createdAt: now,
        updatedAt: now,
      }));
      const projectName = parsed.data.name ?? (tables.length === 1 ? tables[0].name : 'Imported Project');
      const project: Project = { id: nanoid(), name: projectName, tables, createdAt: now, updatedAt: now };
      projectStore.set(project);
      reply.code(201).send({ ok: true, data: project, warnings });
    } catch (e) {
      reply.code(400).send({ ok: false, error: `SQL parse error: ${(e as Error).message}` });
    }
  });

  // ── Generate all tables in a project ──────────────────────────────────────

  app.post('/generate/project', async (req, reply) => {
    const parsed = z.object({
      projectId: z.string(),
      tableConfigs: z.array(z.object({
        tableId: z.string(),
        rowCount: z.number().int().min(1).max(10_000_000),
      })),
      seed: z.number().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: parsed.error.message });

    const project = getProject(parsed.data.projectId, reply);
    if (!project) return;

    const seed = parsed.data.seed ?? Math.floor(Math.random() * 2 ** 31);
    const now = new Date().toISOString();
    const jobId = nanoid();

    // Pre-allocate JSONL paths for all tables
    const resultPaths: Record<string, string> = {};
    for (const tc of parsed.data.tableConfigs) {
      resultPaths[tc.tableId] = jobTempPath(`${jobId}_${tc.tableId}`);
    }

    const job = {
      id: jobId,
      projectId: parsed.data.projectId,
      tableConfigs: parsed.data.tableConfigs as TableRowConfig[],
      status: 'pending' as const,
      progress: 0,
      completedRows: 0,
      seed,
      resultPaths,
      createdAt: now,
    };
    jobStore.set(job);
    reply.send({ ok: true, data: { jobId, seed } });

    const tableConfigs = parsed.data.tableConfigs as TableRowConfig[];
    const totalRows = tableConfigs.reduce((s, c) => s + c.rowCount, 0);
    let allCompletedRows = 0;

    const token = { cancelled: false };
    cancellationTokens.set(jobId, token);

    setImmediate(async () => {
      try {
        jobStore.update(jobId, { status: 'running', progress: 5 });

        await generateProject(
          project.tables,
          tableConfigs,
          seed,
          async (tableId, rows, _tableCompleted, _tableTotal) => {
            await appendJsonlChunk(resultPaths[tableId], rows);
            allCompletedRows += rows.length;
            const progress = Math.min(95, Math.floor((allCompletedRows / totalRows) * 95));
            jobStore.update(jobId, { progress, completedRows: allCompletedRows });
          },
          token,
        );

        jobStore.update(jobId, { status: 'done', progress: 100, completedRows: totalRows });
      } catch (e) {
        if (e instanceof GenerationCancelledError) {
          jobStore.update(jobId, { status: 'cancelled' });
        } else {
          jobStore.update(jobId, {
            status: 'error',
            errorMessage: (e as Error).message,
          });
        }
      } finally {
        cancellationTokens.delete(jobId);
      }
    });
  });

  // ── Cancel project job ─────────────────────────────────────────────────────

  app.delete<{ Params: { jobId: string } }>('/generate/project/:jobId', async (req, reply) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) return reply.code(404).send({ ok: false, error: 'Job not found' });
    if (job.status !== 'running' && job.status !== 'pending') {
      return reply.code(400).send({ ok: false, error: `Job is not running (status: ${job.status})` });
    }
    const token = cancellationTokens.get(req.params.jobId);
    if (token) token.cancelled = true;
    return { ok: true };
  });

  // ── Project job status ─────────────────────────────────────────────────────

  app.get<{ Params: { jobId: string } }>('/generate/project/:jobId/status', async (req, reply) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) return reply.code(404).send({ ok: false, error: 'Job not found' });
    const totalRows = job.tableConfigs?.reduce((s, c) => s + c.rowCount, 0) ?? 0;
    reply.send({
      ok: true,
      data: {
        status: job.status,
        progress: job.progress,
        completedRows: job.completedRows ?? 0,
        totalRows,
        errorMessage: job.errorMessage,
      },
    });
  });

  // ── Project preview (first N rows per table) ───────────────────────────────

  app.get<{ Params: { jobId: string }; Querystring: { rows?: string } }>(
    '/generate/project/:jobId/preview',
    async (req, reply) => {
      const job = jobStore.get(req.params.jobId);
      if (!job) return reply.code(404).send({ ok: false, error: 'Job not found' });
      if (job.status !== 'done') return reply.code(202).send({ ok: false, error: `Not ready: ${job.status}` });

      const n = Math.min(parseInt(req.query.rows ?? '20', 10), 1000);
      const preview: Record<string, unknown[]> = {};

      for (const [tableId, filePath] of Object.entries(job.resultPaths ?? {})) {
        preview[tableId] = await readJsonlRows(filePath, n);
      }
      reply.send({ ok: true, data: preview });
    },
  );

  // ── Export ZIP ─────────────────────────────────────────────────────────────

  app.get<{ Params: { jobId: string }; Querystring: { format?: string } }>(
    '/export/project/:jobId/zip',
    async (req, reply) => {
      const job = jobStore.get(req.params.jobId);
      if (!job) return reply.code(404).send({ ok: false, error: 'Job not found' });
      if (job.status !== 'done') return reply.code(202).send({ ok: false, error: 'Not ready' });
      if (!job.projectId || !job.resultPaths) return reply.code(400).send({ ok: false, error: 'Not a project job' });

      const project = projectStore.get(job.projectId);
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' });

      const format = (req.query.format ?? 'csv') as 'csv' | 'json' | 'sql';

      const { buildZip } = await import('../services/zip-export.service.js');
      const zipStream = buildZip(project.tables, job.resultPaths, format);

      reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="${project.name.replace(/\s+/g, '_')}_synthetic.zip"`);

      return reply.send(zipStream);
    },
  );

  // ── Export SQLite .db ──────────────────────────────────────────────────────

  app.get<{ Params: { jobId: string } }>(
    '/export/project/:jobId/sqlite',
    async (req, reply) => {
      const job = jobStore.get(req.params.jobId);
      if (!job) return reply.code(404).send({ ok: false, error: 'Job not found' });
      if (job.status !== 'done') return reply.code(202).send({ ok: false, error: 'Not ready' });
      if (!job.projectId || !job.resultPaths) return reply.code(400).send({ ok: false, error: 'Not a project job' });

      const project = projectStore.get(job.projectId);
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' });

      const outPath = `${getTempDir()}/${req.params.jobId}_export.db`;

      await buildSqliteDb(project.tables, job.resultPaths, outPath);

      const safeName = project.name.replace(/[^a-zA-Z0-9_\-]/g, '_');
      reply
        .header('Content-Type', 'application/x-sqlite3')
        .header('Content-Disposition', `attachment; filename="${safeName}.db"`);

      return reply.send(fs.createReadStream(outPath));
    },
  );

  // ── SQL query against generated data ───────────────────────────────────────

  // SQLite authorizer action codes (from sqlite3.h)
  const SQLITE_READ      = 20; // reading a column value
  const SQLITE_SELECT    = 21; // start of a SELECT
  const SQLITE_FUNCTION  = 31; // use of a SQL function
  const SQLITE_RECURSIVE = 33; // recursive CTE (WITH RECURSIVE SELECT …)
  // All other actions (INSERT, UPDATE, DELETE, ATTACH, PRAGMA, CREATE, …) are denied.

  app.post<{ Params: { jobId: string }; Body: { sql: string } }>(
    '/query/project/:jobId',
    async (req, reply) => {
      // ── 1. Validate jobId to prevent path traversal ───────────────────────
      // nanoid IDs only contain [A-Za-z0-9_-]. Reject anything else before
      // the ID is ever used to build a file-system path.
      const jobId = req.params.jobId;
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(jobId)) {
        return reply.code(400).send({ ok: false, error: 'Invalid job ID' });
      }

      // ── 2. Verify the job exists and belongs to a project ─────────────────
      const job = jobStore.get(jobId);
      if (!job) return reply.code(404).send({ ok: false, error: 'Job not found' });
      if (job.status !== 'done') return reply.code(202).send({ ok: false, error: 'Not ready' });
      if (!job.projectId || !job.resultPaths) {
        return reply.code(400).send({ ok: false, error: 'Not a project job' });
      }

      // ── 3. Validate SQL input ──────────────────────────────────────────────
      const { sql } = req.body;
      if (!sql?.trim()) return reply.code(400).send({ ok: false, error: 'Missing sql' });

      // Surface-level check: must start with SELECT or WITH (for CTEs).
      // The authorizer below enforces this at the SQLite engine level too.
      if (!/^\s*(select|with)\b/i.test(sql.trim())) {
        return reply.code(400).send({ ok: false, error: 'Only SELECT queries are allowed' });
      }

      // ── 4. Resolve the project's own SQLite export file ───────────────────
      // The path is derived solely from the job ID that was validated above.
      // It always lives inside the controlled temp directory; the job record
      // was fetched from the server-side store — callers cannot influence the
      // path at all.
      const project = projectStore.get(job.projectId);
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' });

      const dbPath = `${getTempDir()}/${jobId}_export.db`;

      if (!fs.existsSync(dbPath)) {
        await buildSqliteDb(project.tables, job.resultPaths, dbPath);
      }

      // ── 5. Open read-only with engine-level authorizer ────────────────────
      // `readonly: true` prevents any writes at the OS level.
      // The authorizer is a SQLite-engine callback — it fires for every
      // operation the query parser produces, before execution.  Nothing in
      // the SQL text can circumvent it.
      const db = new Database(dbPath, { readonly: true });

      db.authorize((action: number) => {
        if (
          action === SQLITE_SELECT   ||  // SELECT statement
          action === SQLITE_READ     ||  // read a column
          action === SQLITE_FUNCTION ||  // built-in functions (COUNT, etc.)
          action === SQLITE_RECURSIVE    // WITH RECURSIVE …
        ) {
          return 0; // SQLITE_OK — allow
        }
        // Deny ATTACH, PRAGMA, INSERT, UPDATE, DELETE, DROP, CREATE, …
        return 1; // SQLITE_DENY
      });

      try {
        const stmt = db.prepare(sql);
        const rows = stmt.all() as Record<string, unknown>[];
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        return reply.send({ ok: true, data: { rows: rows.slice(0, 1000), columns } });
      } catch (e) {
        return reply.code(400).send({ ok: false, error: (e as Error).message });
      } finally {
        db.close();
      }
    },
  );
}
