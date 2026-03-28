import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { schemaStore, jobStore } from '../store/session.store.js';
import { applyRules } from '../services/rule-engine.service.js';
import { generateRowsChunked, createStreamingContext } from '../services/streaming-generator.service.js';
import { appendJsonlChunk, readJsonlRows, jobTempPath, cleanupJobFiles } from '../services/tempfile.service.js';
import { GenerationCancelledError } from '../types/index.js';
import type { GenerationJob } from '../types/index.js';

// ─── In-memory cancellation tokens (transient — lost on restart, intentionally) ─

const cancellationTokens = new Map<string, { cancelled: boolean }>();

export async function generateRoutes(app: FastifyInstance) {

  // POST /generate — start single-table generation job
  app.post('/generate', async (req, reply) => {
    const { schemaId, rowCount, seed } = req.body as {
      schemaId?: string;
      rowCount?: number;
      seed?: number;
    };

    if (!schemaId) return reply.code(400).send({ ok: false, error: 'Missing schemaId' });
    const schema = schemaStore.get(schemaId);
    if (!schema) return reply.code(404).send({ ok: false, error: 'Schema not found' });

    const count = Math.min(Math.max(Number(rowCount) || 100, 1), 10_000_000);
    const resolvedSeed = seed ?? Math.floor(Math.random() * 1_000_000);
    const resultPath = jobTempPath(nanoid());

    const job: GenerationJob = {
      id: nanoid(),
      schemaId,
      rowCount: count,
      status: 'pending',
      progress: 0,
      completedRows: 0,
      seed: resolvedSeed,
      resultPath,
      createdAt: new Date().toISOString(),
    };
    jobStore.set(job);

    const token = { cancelled: false };
    cancellationTokens.set(job.id, token);

    // Run async (non-blocking)
    setImmediate(async () => {
      jobStore.update(job.id, { status: 'running', progress: 5 });
      try {
        const ctx = createStreamingContext();
        let firstChunk = true;

        await generateRowsChunked(
          schema.columns,
          count,
          resolvedSeed,
          ctx,
          async (rows, completedRows) => {
            // Apply conditional rules per chunk
            const processed = applyRules(rows, schema.rules);

            // First chunk: truncate file (clean state on retry)
            if (firstChunk) {
              const fs = await import('fs');
              try { fs.unlinkSync(resultPath); } catch { /* ok */ }
              firstChunk = false;
            }

            await appendJsonlChunk(resultPath, processed);

            const progress = Math.min(95, Math.floor((completedRows / count) * 95));
            jobStore.update(job.id, { progress, completedRows });
          },
          token,
        );

        jobStore.update(job.id, { status: 'done', progress: 100, completedRows: count });
      } catch (e) {
        if (e instanceof GenerationCancelledError) {
          jobStore.update(job.id, { status: 'cancelled' });
          cleanupJobFiles(job.id);
        } else {
          jobStore.update(job.id, { status: 'error', errorMessage: (e as Error).message });
        }
      } finally {
        cancellationTokens.delete(job.id);
      }
    });

    return { ok: true, data: { jobId: job.id, seed: resolvedSeed } };
  });

  // DELETE /generate/:jobId — cancel a running job
  app.delete<{ Params: { jobId: string } }>('/generate/:jobId', async (req, reply) => {
    const job = jobStore.get(req.params.jobId);
    if (!job) return reply.code(404).send({ ok: false, error: 'Job not found' });
    if (job.status !== 'running' && job.status !== 'pending') {
      return reply.code(400).send({ ok: false, error: `Job is not running (status: ${job.status})` });
    }
    const token = cancellationTokens.get(req.params.jobId);
    if (token) token.cancelled = true;
    return { ok: true };
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
        completedRows: job.completedRows ?? 0,
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
      const resultPath = job.resultPath ?? jobStore.getResultPath(job.id);
      if (!resultPath) return reply.code(404).send({ ok: false, error: 'Result file not found' });
      const rows = await readJsonlRows(resultPath, previewCount);
      return { ok: true, data: rows };
    },
  );
}
