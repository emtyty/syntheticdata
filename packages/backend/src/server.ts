import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { schemaRoutes } from './routes/schema.routes.js';
import { generateRoutes } from './routes/generate.routes.js';
import { exportRoutes } from './routes/export.routes.js';
import { projectRoutes } from './routes/project.routes.js';
import { statsRoutes } from './routes/stats.routes.js';
import { templateRoutes } from './routes/template.routes.js';

const app = Fastify({ logger: { level: 'info' } });

await app.register(cors, { origin: 'http://localhost:5173' });
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB

await app.register(schemaRoutes, { prefix: '/api/v1' });
await app.register(generateRoutes, { prefix: '/api/v1' });
await app.register(exportRoutes, { prefix: '/api/v1' });
await app.register(projectRoutes, { prefix: '/api/v1' });
await app.register(statsRoutes, { prefix: '/api/v1' });
await app.register(templateRoutes, { prefix: '/api/v1' });

app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

const port = Number(process.env.PORT ?? 3001);
// Bind to loopback by default — this is a local dev tool with no auth.
// Override with HOST=0.0.0.0 (or your LAN IP) only when intentional.
const host = process.env.HOST ?? '127.0.0.1';
await app.listen({ port, host });
console.log(`Backend running on http://localhost:${port}`);
