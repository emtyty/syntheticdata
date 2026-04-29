import type { FastifyInstance } from 'fastify';
import { jobStore } from '../store/session.store.js';

export async function statsRoutes(app: FastifyInstance) {
  app.get('/stats', async () => {
    const jobs = jobStore.list();
    const doneJobs = jobs.filter(j => j.status === 'done');

    let totalRowsGenerated = 0;
    for (const job of doneJobs) {
      if (job.rowCount) {
        totalRowsGenerated += job.rowCount;
      } else if (job.tableConfigs) {
        totalRowsGenerated += job.tableConfigs.reduce((s, tc) => s + tc.rowCount, 0);
      }
    }

    const lastActivity = jobs.length > 0 ? jobs[0].createdAt : null;

    return {
      ok: true,
      data: {
        totalJobsCompleted: doneJobs.length,
        totalRowsGenerated,
        lastActivity,
      },
    };
  });
}
