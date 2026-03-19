import type { FastifyInstance, FastifyReply } from 'fastify';
import { jobStore, schemaStore } from '../store/session.store.js';
import { toCsv, toJson, toSqlInserts } from '../services/export.service.js';

export async function exportRoutes(app: FastifyInstance) {
  function getJob(jobId: string, reply: FastifyReply) {
    const job = jobStore.get(jobId);
    if (!job) { reply.code(404).send({ ok: false, error: 'Job not found' }); return null; }
    if (job.status !== 'done') { reply.code(202).send({ ok: false, error: `Job not ready: ${job.status}` }); return null; }
    return job;
  }

  // GET /export/:jobId/csv
  app.get<{ Params: { jobId: string }; Querystring: { header?: string } }>(
    '/export/:jobId/csv',
    async (req, reply) => {
      const job = getJob(req.params.jobId, reply);
      if (!job) return;
      const includeHeader = req.query.header !== 'false';
      const csv = toCsv(job.result ?? [], includeHeader);
      reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="synthetic_${job.id}.csv"`)
        .send(csv);
    },
  );

  // GET /export/:jobId/json
  app.get<{ Params: { jobId: string }; Querystring: { pretty?: string } }>(
    '/export/:jobId/json',
    async (req, reply) => {
      const job = getJob(req.params.jobId, reply);
      if (!job) return;
      const pretty = req.query.pretty === 'true';
      const json = toJson(job.result ?? [], pretty);
      reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="synthetic_${job.id}.json"`)
        .send(json);
    },
  );

  // GET /export/:jobId/sql
  app.get<{ Params: { jobId: string }; Querystring: { table?: string } }>(
    '/export/:jobId/sql',
    async (req, reply) => {
      const job = getJob(req.params.jobId, reply);
      if (!job) return;
      const schema = job.schemaId ? schemaStore.get(job.schemaId) : undefined;
      const tableName = (req.query.table ?? schema?.name) as string ?? 'generated_data';
      const sql = toSqlInserts(job.result ?? [], tableName);
      reply
        .header('Content-Type', 'text/plain')
        .header('Content-Disposition', `attachment; filename="synthetic_${job.id}.sql"`)
        .send(sql);
    },
  );
}
