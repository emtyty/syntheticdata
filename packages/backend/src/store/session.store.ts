/**
 * In-memory session store.
 * Holds schemas and generation jobs for the lifetime of the server process.
 * Replace with a persistent DB if needed in the future.
 */

import type { DatasetSchema, GenerationJob, Project } from '../types/index.js';

const schemas = new Map<string, DatasetSchema>();
const jobs = new Map<string, GenerationJob>();
const projects = new Map<string, Project>();

export const schemaStore = {
  set: (schema: DatasetSchema) => schemas.set(schema.id, schema),
  get: (id: string) => schemas.get(id),
  list: () => Array.from(schemas.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  ),
  delete: (id: string) => schemas.delete(id),
};

export const projectStore = {
  set: (p: Project) => projects.set(p.id, p),
  get: (id: string) => projects.get(id),
  list: () => Array.from(projects.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  ),
  delete: (id: string) => projects.delete(id),
};

export const jobStore = {
  set: (job: GenerationJob) => jobs.set(job.id, job),
  get: (id: string) => jobs.get(id),
  update: (id: string, patch: Partial<GenerationJob>) => {
    const job = jobs.get(id);
    if (job) jobs.set(id, { ...job, ...patch });
  },
};
