import { useEffect, useState } from 'react';
import {
  Plus, Trash2, FolderOpen, Database, FileCode2, X, Loader2, TableProperties,
} from 'lucide-react';
import {
  listProjects, createProject, deleteProject, inferFromPrisma, inferProjectFromSql,
} from '../api/client.js';
import type { Project } from '../types/index.js';

interface Props {
  onCreate: (project: Project) => void;
  onOpen: (projectId: string) => void;
}

type ModalMode = 'manual' | 'prisma' | 'sql' | null;

export function ProjectList({ onCreate, onOpen }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    await deleteProject(id);
    setProjects((ps) => ps.filter((p) => p.id !== id));
  }

  function openModal(mode: ModalMode) {
    setModalMode(mode);
  }

  function handleCreated(project: Project) {
    setProjects((ps) => [project, ...ps]);
    setModalMode(null);
    onCreate(project);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-primary text-2xl">⬡</span>
              <h1 className="text-xl font-bold">Synthetic Data Studio</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Generate realistic synthetic datasets for testing and development
            </p>
          </div>
          <button
            onClick={() => openModal('manual')}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Quick import cards */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Quick Import
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => openModal('prisma')}
              className="flex items-center gap-3 bg-card border border-border hover:border-primary/50 rounded-xl p-4 text-left transition-colors group"
            >
              <div className="w-10 h-10 bg-violet-500/10 rounded-lg flex items-center justify-center shrink-0">
                <Database className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <div className="font-medium text-sm group-hover:text-primary transition-colors">
                  Import from Prisma Schema
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Paste your .prisma file to auto-generate tables
                </div>
              </div>
            </button>

            <button
              onClick={() => openModal('sql')}
              className="flex items-center gap-3 bg-card border border-border hover:border-primary/50 rounded-xl p-4 text-left transition-colors group"
            >
              <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center shrink-0">
                <FileCode2 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="font-medium text-sm group-hover:text-primary transition-colors">
                  Import from SQL DDL
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Paste CREATE TABLE statements to build your schema
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Project list */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Projects
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border rounded-xl">
              <TableProperties className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">No projects yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Create a new project or import from Prisma / SQL above
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={() => onOpen(project.id)}
                  onDelete={() => handleDelete(project.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {modalMode && (
        <ImportModal
          mode={modalMode}
          onClose={() => setModalMode(null)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

interface CardProps {
  project: Project;
  onOpen: () => void;
  onDelete: () => void;
}

function ProjectCard({ project, onOpen, onDelete }: CardProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate">{project.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {project.tables.length} {project.tables.length === 1 ? 'table' : 'tables'}
          </p>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {project.tables.slice(0, 4).map((t) => (
          <span key={t.id} className="text-xs bg-muted border border-border rounded px-1.5 py-0.5 font-mono text-muted-foreground">
            {t.name}
          </span>
        ))}
        {project.tables.length > 4 && (
          <span className="text-xs text-muted-foreground/60">+{project.tables.length - 4} more</span>
        )}
      </div>

      <div className="flex items-center justify-between mt-auto pt-1 border-t border-border/50">
        <span className="text-xs text-muted-foreground">
          {new Date(project.updatedAt).toLocaleDateString()}
        </span>
        <button
          onClick={onOpen}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Open
        </button>
      </div>
    </div>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

interface ModalProps {
  mode: 'manual' | 'prisma' | 'sql';
  onClose: () => void;
  onCreated: (project: Project) => void;
}

function ImportModal({ mode, onClose, onCreated }: ModalProps) {
  const [projectName, setProjectName] = useState('');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === 'manual' ? 'New Project' : mode === 'prisma' ? 'Import Prisma Schema' : 'Import SQL DDL';
  const placeholder =
    mode === 'prisma'
      ? 'Paste your .prisma schema here...'
      : mode === 'sql'
      ? 'Paste your CREATE TABLE SQL here...'
      : '';

  async function handleSubmit() {
    if (!projectName.trim()) {
      setError('Project name is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let project: Project;
      if (mode === 'manual') {
        project = await createProject(projectName.trim(), []);
      } else if (mode === 'prisma') {
        project = await inferFromPrisma(source, projectName.trim());
      } else {
        project = await inferProjectFromSql(source, projectName.trim());
      }
      onCreated(project);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Project Name</label>
            <input
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="My awesome project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && mode === 'manual' && handleSubmit()}
              autoFocus
            />
          </div>

          {mode !== 'manual' && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">
                {mode === 'prisma' ? 'Prisma Schema' : 'SQL DDL'}
              </label>
              <textarea
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                placeholder={placeholder}
                rows={10}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !projectName.trim()}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {mode === 'manual' ? 'Create Project' : 'Parse & Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
