import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { projectStore, jobStore } from '../store/session.store.js';
import { parsePrismaSchema } from '../services/prisma-parser.service.js';
import { parseSQLMultiple } from '../services/sql-parser.service.js';
import { generateProject } from '../services/multi-generate.service.js';
import { buildZip } from '../services/zip-export.service.js';
import type { DatasetSchema, Project, TableRowConfig } from '../types/index.js';

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

  // Create project (manual/from body)
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

  // Update project (save tables + relationships)
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
      const project: Project = {
        id: nanoid(),
        name: projectName,
        tables,
        createdAt: now,
        updatedAt: now,
      };
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
      tableConfigs: z.array(z.object({ tableId: z.string(), rowCount: z.number().int().min(1).max(100_000) })),
      seed: z.number().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: parsed.error.message });

    const project = getProject(parsed.data.projectId, reply);
    if (!project) return;

    const seed = parsed.data.seed ?? Math.floor(Math.random() * 2 ** 31);
    const now = new Date().toISOString();
    const jobId = nanoid();

    const job = {
      id: jobId,
      projectId: parsed.data.projectId,
      tableConfigs: parsed.data.tableConfigs,
      status: 'pending' as const,
      progress: 0,
      seed,
      createdAt: now,
    };
    jobStore.set(job);
    reply.send({ ok: true, data: { jobId, seed } });

    // Run async
    const tableConfigs = parsed.data.tableConfigs as TableRowConfig[];
    setImmediate(async () => {
      try {
        jobStore.update(jobId, { status: 'running', progress: 10 });
        const results = generateProject(project.tables, tableConfigs, seed);
        jobStore.update(jobId, { status: 'done', progress: 100, results });
      } catch (e) {
        jobStore.update(jobId, { status: 'error', errorMessage: (e as Error).message });
      }
    });
  });

  // ── Project job status ─────────────────────────────────────────────────────

  app.get<{ Params: { jobId: string } }>('/generate/project/:jobId/status', async (req, reply) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) return reply.code(404).send({ ok: false, error: 'Job not found' });
    reply.send({ ok: true, data: { status: job.status, progress: job.progress, errorMessage: job.errorMessage } });
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
      for (const [tableId, rows] of Object.entries(job.results ?? {})) {
        preview[tableId] = rows.slice(0, n);
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
      if (!job.projectId || !job.results) return reply.code(400).send({ ok: false, error: 'Not a project job' });

      const project = projectStore.get(job.projectId);
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' });

      const format = (req.query.format ?? 'csv') as 'csv' | 'json' | 'sql';
      const zipBuffer = await buildZip(project.tables, job.results, format);

      reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="${project.name.replace(/\s+/g,'_')}_synthetic.zip"`)
        .send(zipBuffer);
    },
  );
}
