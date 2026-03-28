import axios from 'axios';
import type { ColumnSchema, DatasetSchema, GeneratedRow, Project, TableRowConfig } from '../types/index.js';

const api = axios.create({ baseURL: '/api/v1' });

export interface InferredResult {
  columns: Omit<ColumnSchema, 'id'>[];
  rowCount: number;
  warnings: string[];
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export async function inferFromCsv(file: File): Promise<InferredResult> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<{ ok: true; data: InferredResult }>('/schemas/infer/csv', form);
  return data.data;
}

export async function inferFromSql(ddl: string): Promise<{ columns: Omit<ColumnSchema, 'id'>[]; tableName: string; warnings: string[] }> {
  const { data } = await api.post('/schemas/infer/sql', { ddl });
  return data.data;
}

export async function saveSchema(schema: Omit<DatasetSchema, 'id' | 'createdAt' | 'updatedAt'>): Promise<DatasetSchema> {
  const { data } = await api.post<{ ok: true; data: DatasetSchema }>('/schemas', schema);
  return data.data;
}

export async function updateSchema(id: string, schema: Omit<DatasetSchema, 'id' | 'createdAt' | 'updatedAt'>): Promise<DatasetSchema> {
  const { data } = await api.put<{ ok: true; data: DatasetSchema }>(`/schemas/${id}`, schema);
  return data.data;
}

export async function listSchemas(): Promise<DatasetSchema[]> {
  const { data } = await api.get<{ ok: true; data: DatasetSchema[] }>('/schemas');
  return data.data;
}

export async function listPools(): Promise<{ poolName: string; schemaId: string; schemaName: string }[]> {
  const { data } = await api.get<{ ok: true; data: { poolName: string; schemaId: string; schemaName: string }[] }>('/pools');
  return data.data;
}

// ─── Generation ───────────────────────────────────────────────────────────────

export async function startGeneration(schemaId: string, rowCount: number, seed?: number): Promise<{ jobId: string; seed: number }> {
  const { data } = await api.post<{ ok: true; data: { jobId: string; seed: number } }>('/generate', { schemaId, rowCount, seed });
  return data.data;
}

export async function pollJobStatus(jobId: string): Promise<{
  status: string; progress: number; completedRows: number; rowCount?: number; errorMessage?: string;
}> {
  const { data } = await api.get(`/generate/${jobId}/status`);
  return data.data;
}

export async function pollProjectJobStatus(jobId: string): Promise<{
  status: string; progress: number; completedRows: number; totalRows: number; errorMessage?: string;
}> {
  const { data } = await api.get(`/generate/project/${jobId}/status`);
  return data.data;
}

export async function cancelJob(jobId: string): Promise<void> {
  await api.delete(`/generate/${jobId}`);
}

export async function cancelProjectJob(jobId: string): Promise<void> {
  await api.delete(`/generate/project/${jobId}`);
}

export async function getPreview(jobId: string, rows = 20): Promise<GeneratedRow[]> {
  const { data } = await api.get(`/generate/${jobId}/preview?rows=${rows}`);
  return data.data;
}

// ─── Export download helpers ──────────────────────────────────────────────────

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  const { data } = await api.get<{ ok: true; data: Project[] }>('/projects');
  return data.data;
}

export async function getProject(id: string): Promise<Project> {
  const { data } = await api.get<{ ok: true; data: Project }>(`/projects/${id}`);
  return data.data;
}

export async function createProject(name: string, tables: DatasetSchema[]): Promise<Project> {
  const { data } = await api.post<{ ok: true; data: Project }>('/projects', { name, tables });
  return data.data;
}

export async function updateProject(id: string, name: string, tables: DatasetSchema[]): Promise<Project> {
  const { data } = await api.put<{ ok: true; data: Project }>(`/projects/${id}`, { name, tables });
  return data.data;
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/projects/${id}`);
}

export async function inferFromPrisma(source: string, name?: string): Promise<Project> {
  const { data } = await api.post<{ ok: true; data: Project }>('/projects/infer/prisma', { source, name });
  return data.data;
}

export async function inferProjectFromSql(sql: string, name?: string): Promise<Project> {
  const { data } = await api.post<{ ok: true; data: Project }>('/projects/infer/sql', { sql, name });
  return data.data;
}

export async function startProjectGeneration(
  projectId: string,
  tableConfigs: TableRowConfig[],
  seed?: number,
): Promise<{ jobId: string; seed: number }> {
  const { data } = await api.post<{ ok: true; data: { jobId: string; seed: number } }>(
    '/generate/project',
    { projectId, tableConfigs, seed },
  );
  return data.data;
}

export async function getProjectPreview(jobId: string, rows = 20): Promise<Record<string, GeneratedRow[]>> {
  const { data } = await api.get(`/generate/project/${jobId}/preview?rows=${rows}`);
  return data.data;
}

export function projectZipUrl(jobId: string, format: 'csv' | 'json' | 'sql'): string {
  return `/api/v1/export/project/${jobId}/zip?format=${format}`;
}

export function projectSqliteUrl(jobId: string): string {
  return `/api/v1/export/project/${jobId}/sqlite`;
}

export async function queryProjectData(
  jobId: string,
  sql: string,
): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
  const { data } = await api.post<{ ok: true; data: { rows: Record<string, unknown>[]; columns: string[] } }>(
    `/query/project/${jobId}`,
    { sql },
  );
  return data.data;
}

// ─── Export download helpers ──────────────────────────────────────────────────

export function exportUrl(jobId: string, format: 'csv' | 'json' | 'sql', opts?: { table?: string; pretty?: boolean; header?: boolean }): string {
  const params = new URLSearchParams();
  if (opts?.table) params.set('table', opts.table);
  if (opts?.pretty) params.set('pretty', 'true');
  if (opts?.header === false) params.set('header', 'false');
  const qs = params.toString() ? `?${params.toString()}` : '';
  return `/api/v1/export/${jobId}/${format}${qs}`;
}
