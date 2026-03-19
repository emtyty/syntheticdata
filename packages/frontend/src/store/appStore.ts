import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type {
  AppStep, ColumnSchema, ConditionalRule, DatasetSchema,
  GeneratedRow, JobStatus,
} from '../types/index.js';

interface AppState {
  // Navigation
  step: AppStep;
  setStep: (s: AppStep) => void;

  // Schema being edited
  schema: DatasetSchema | null;
  schemaServerSaved: boolean;          // true once schema exists in backend store
  setSchema: (s: DatasetSchema, serverSaved?: boolean) => void;
  updateColumn: (col: ColumnSchema) => void;
  addColumn: () => void;
  removeColumn: (id: string) => void;
  reorderColumns: (ids: string[]) => void;

  // Rules
  addRule: (rule: ConditionalRule) => void;
  updateRule: (rule: ConditionalRule) => void;
  removeRule: (id: string) => void;

  // Generation job
  jobId: string | null;
  jobStatus: JobStatus | null;
  jobProgress: number;
  jobSeed: number | null;
  jobError: string | null;
  setJob: (jobId: string, seed: number) => void;
  setJobStatus: (status: JobStatus, progress: number, error?: string) => void;

  // Preview data
  previewRows: GeneratedRow[];
  setPreviewRows: (rows: GeneratedRow[]) => void;

  // Row count & seed for generation config
  rowCount: number;
  setRowCount: (n: number) => void;
  seedInput: string;
  setSeedInput: (s: string) => void;
}

const DEFAULT_COL = (): ColumnSchema => ({
  id: nanoid(),
  name: 'new_column',
  dataType: 'string',
  indexType: 'none',
  notNull: false,
  generatorConfig: { nullRate: 0 },
});

export const useAppStore = create<AppState>((set) => ({
  step: 'import',
  setStep: (step) => set({ step }),

  schema: null,
  schemaServerSaved: false,
  setSchema: (schema, serverSaved) => set(s => ({
    schema,
    schemaServerSaved: serverSaved !== undefined ? serverSaved : s.schemaServerSaved,
  })),

  updateColumn: (col) =>
    set(s => ({
      schema: s.schema
        ? { ...s.schema, columns: s.schema.columns.map(c => c.id === col.id ? col : c) }
        : s.schema,
    })),

  addColumn: () =>
    set(s => ({
      schema: s.schema
        ? { ...s.schema, columns: [...s.schema.columns, DEFAULT_COL()] }
        : s.schema,
    })),

  removeColumn: (id) =>
    set(s => ({
      schema: s.schema
        ? { ...s.schema, columns: s.schema.columns.filter(c => c.id !== id) }
        : s.schema,
    })),

  reorderColumns: (ids) =>
    set(s => {
      if (!s.schema) return s;
      const map = new Map(s.schema.columns.map(c => [c.id, c]));
      return { schema: { ...s.schema, columns: ids.map(id => map.get(id)!).filter(Boolean) } };
    }),

  addRule: (rule) =>
    set(s => ({
      schema: s.schema ? { ...s.schema, rules: [...s.schema.rules, rule] } : s.schema,
    })),

  updateRule: (rule) =>
    set(s => ({
      schema: s.schema
        ? { ...s.schema, rules: s.schema.rules.map(r => r.id === rule.id ? rule : r) }
        : s.schema,
    })),

  removeRule: (id) =>
    set(s => ({
      schema: s.schema
        ? { ...s.schema, rules: s.schema.rules.filter(r => r.id !== id) }
        : s.schema,
    })),

  jobId: null,
  jobStatus: null,
  jobProgress: 0,
  jobSeed: null,
  jobError: null,
  setJob: (jobId, seed) => set({ jobId, jobSeed: seed, jobStatus: 'pending', jobProgress: 0, jobError: null }),
  setJobStatus: (status, progress, error) => set({ jobStatus: status, jobProgress: progress, jobError: error ?? null }),

  previewRows: [],
  setPreviewRows: (rows) => set({ previewRows: rows }),

  rowCount: 100,
  setRowCount: (n) => set({ rowCount: n }),
  seedInput: '',
  setSeedInput: (s) => set({ seedInput: s }),
}));
