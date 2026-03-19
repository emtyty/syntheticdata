import { create } from 'zustand';
import type { DatasetSchema, GeneratedRow, Project, ProjectTab } from '../types/index.js';

interface ProjectStore {
  project: Project | null;
  activeTableId: string | null;
  activeTab: ProjectTab;
  jobId: string | null;
  jobSeed: number | null;
  jobResults: Record<string, GeneratedRow[]> | null;

  setProject: (p: Project) => void;
  setActiveTableId: (id: string | null) => void;
  setActiveTab: (tab: ProjectTab) => void;
  updateTable: (table: DatasetSchema) => void;
  addTable: (table: DatasetSchema) => void;
  removeTable: (tableId: string) => void;
  setJobResult: (jobId: string, seed: number, results: Record<string, GeneratedRow[]>) => void;
  reset: () => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  project: null,
  activeTableId: null,
  activeTab: 'tables',
  jobId: null,
  jobSeed: null,
  jobResults: null,

  setProject: (project) => set({ project }),
  setActiveTableId: (activeTableId) => set({ activeTableId }),
  setActiveTab: (activeTab) => set({ activeTab }),

  updateTable: (table) =>
    set((s) => ({
      project: s.project
        ? { ...s.project, tables: s.project.tables.map((t) => (t.id === table.id ? table : t)) }
        : s.project,
    })),

  addTable: (table) =>
    set((s) => ({
      project: s.project
        ? { ...s.project, tables: [...s.project.tables, table] }
        : s.project,
      activeTableId: table.id,
    })),

  removeTable: (tableId) =>
    set((s) => {
      if (!s.project) return s;
      const tables = s.project.tables.filter((t) => t.id !== tableId);
      const activeTableId =
        s.activeTableId === tableId ? (tables[0]?.id ?? null) : s.activeTableId;
      return { project: { ...s.project, tables }, activeTableId };
    }),

  setJobResult: (jobId, jobSeed, jobResults) => set({ jobId, jobSeed, jobResults }),

  reset: () =>
    set({
      project: null,
      activeTableId: null,
      activeTab: 'tables',
      jobId: null,
      jobSeed: null,
      jobResults: null,
    }),
}));
