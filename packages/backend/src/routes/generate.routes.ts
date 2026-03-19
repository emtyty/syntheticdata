import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { schemaStore, jobStore } from '../store/session.store.js';
import { generateRows } from '../services/generator.service.js';
import { applyRules } from '../services/rule-engine.service.js';
import type { GenerationJob } from '../types/index.js';

export async function generateRoutes(app: FastifyInstance) {
  // POST /generate — start generation job
  app.post('/generate', async (req, reply) => {
    const { schemaId, rowCount, seed } = req.body as {
      schemaId?: string;
      rowCount?: number;
      seed?: number;
    };

    if (!schemaId) return reply.code(400).send({ ok: false, error: 'Missing schemaId' });
    const schema = schemaStore.get(schemaId);
    if (!schema) return reply.code(404).send({ ok: false, error: 'Schema not found' });

    const count = Math.min(Math.max(Number(rowCount) || 100, 1), 100_000);
    const resolvedSeed = seed ?? Math.floor(Math.random() * 1_000_000);

    const job: GenerationJob = {
      id: nanoid(),
      schemaId,
      rowCount: count,
      status: 'pending',
      progress: 0,
      seed: resolvedSeed,
      createdAt: new Date().toISOString(),
    };
    jobStore.set(job);

    // Run async (non-blocking)
    setImmediate(async () => {
      jobStore.update(job.id, { status: 'running', progress: 10 });
      try {
        const { rows } = generateRows(schema.columns, count, resolvedSeed);
        jobStore.update(job.id, { progress: 70 });
        const finalRows = applyRules(rows, schema.rules);
        jobStore.update(job.id, { status: 'done', progress: 100, result: finalRows });
      } catch (e) {
        jobStore.update(job.id, {
          status: 'error',
          errorMessage: (e as Error).message,
        });
      }
    });

    return { ok: true, data: { jobId: job.id, seed: resolvedSeed } };
  });

  // GET /generate/:jobId/status
  app.get<{ Params: { jobId: string } }>('/generate/:jobId/status', async (req, reply) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) return reply.code(404).send({ ok: false, error: 'Job not found' });
    return {
      ok: true,
      data: {
        id: job.id,
        status: job.status,
        progress: job.progress,
        rowCount: job.rowCount,
        seed: job.seed,
        errorMessage: job.errorMessage,
      },
    };
  });

  // GET /generate/:jobId/preview?rows=20
  app.get<{ Params: { jobId: string }; Querystring: { rows?: string } }>(
    '/generate/:jobId/preview',
    async (req, reply) => {
      const job = jobStore.get(req.params.jobId);
      if (!job) return reply.code(404).send({ ok: false, error: 'Job not found' });
      if (job.status !== 'done') {
        return reply.code(202).send({ ok: false, error: `Job status: ${job.status}` });
      }
      const previewCount = Math.min(Number(req.query.rows) || 20, 100);
      return { ok: true, data: (job.result ?? []).slice(0, previewCount) };
    },
  );
}
