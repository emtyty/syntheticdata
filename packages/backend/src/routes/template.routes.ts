import type { FastifyInstance } from 'fastify';
import { listTemplates, buildProjectFromTemplate } from '../services/template.service.js';
import { projectStore } from '../store/session.store.js';

export async function templateRoutes(app: FastifyInstance) {
  app.get('/templates', async () => {
    return { ok: true, data: listTemplates() };
  });

  app.post<{ Body: { templateId: string; projectName: string } }>(
    '/projects/from-template',
    async (req, reply) => {
      const { templateId, projectName } = req.body ?? {};
      if (!templateId || !projectName?.trim()) {
        return reply.code(400).send({ ok: false, error: 'templateId and projectName are required' });
      }
      const project = buildProjectFromTemplate(templateId, projectName.trim());
      if (!project) {
        return reply.code(404).send({ ok: false, error: `Template "${templateId}" not found` });
      }
      projectStore.set(project);
      return { ok: true, data: project };
    },
  );
}
