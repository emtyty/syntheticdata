import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader2 } from 'lucide-react';
import {
  listProjects, createProject, deleteProject, inferFromPrisma, inferProjectFromSql,
} from '../api/client.js';
import type { Project } from '../types/index.js';
import { Sidebar } from '../components/layout/Sidebar.js';

type ModalMode = 'manual' | 'prisma' | 'sql' | null;

export function ProjectList() {
  const navigate = useNavigate();
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

  function handleCreated(project: Project) {
    navigate(`/projects/${project.id}/tables`);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0e14]">
      <Sidebar onNewProject={() => setModalMode('manual')} />

      <main className="flex-1 ml-64 flex flex-col overflow-hidden">
        {/* Top Nav */}
        <header className="flex items-center justify-between px-8 w-full h-16 sticky top-0 z-50 bg-[#0a0e14]/80 backdrop-blur-md border-b border-[#151a21] shrink-0">
          <div className="flex items-center flex-1 max-w-xl">
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
              <input
                className="bg-surface-container-low border-none rounded-md py-2 pl-10 pr-4 text-sm w-full focus:ring-1 focus:ring-tertiary placeholder:text-on-surface-variant/50 font-body outline-none"
                placeholder="Search synthetic models..."
                type="text"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 ml-8">
            <button className="p-2 text-slate-400 hover:text-white hover:bg-[#262c36] rounded-md transition-all duration-300">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="p-2 text-slate-400 hover:text-white hover:bg-[#262c36] rounded-md transition-all duration-300">
              <span className="material-symbols-outlined">help_outline</span>
            </button>
          </div>
        </header>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Hero */}
          <section className="relative px-8 pt-14 pb-20 overflow-hidden">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] -z-10 rounded-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-tertiary/5 blur-[100px] -z-10 rounded-full pointer-events-none" />
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-surface-container border border-[#44484f]/20 rounded-full mb-6">
                <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
                <span className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">Engine v2.4 Live</span>
              </div>
              <h1 className="text-5xl font-bold font-headline leading-tight tracking-tight mb-5 bg-gradient-to-br from-on-surface via-on-surface to-primary-fixed-dim bg-clip-text text-transparent">
                Generate realistic<br />synthetic datasets
              </h1>
              <p className="text-base text-on-surface-variant max-w-2xl mb-8 leading-relaxed">
                Automated schema inference with FK relationships and privacy controls.
                Build production-grade mock environments from Prisma or SQL in seconds.
              </p>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setModalMode('manual')}
                  className="px-7 py-3.5 bg-primary text-on-primary-fixed font-headline font-extrabold tracking-wider text-sm rounded-md hover:brightness-110 transition-all duration-300"
                >
                  START SYNTHESIS
                </button>
                <button className="px-7 py-3.5 bg-surface-container border border-[#44484f]/30 text-on-surface font-headline font-bold text-sm rounded-md hover:bg-surface-bright transition-all">
                  VIEW DOCUMENTATION
                </button>
              </div>
            </div>
          </section>

          {/* Quick Import */}
          <section className="px-8 mb-14">
            <div className="flex items-center gap-3 mb-7">
              <h2 className="font-headline text-2xl font-bold">Quick Import</h2>
              <div className="h-px flex-1 bg-gradient-to-r from-[#44484f]/30 to-transparent" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Prisma */}
              <button
                onClick={() => setModalMode('prisma')}
                className="group relative p-8 bg-surface-container rounded-xl border border-[#44484f]/10 hover:border-primary/40 transition-all duration-300 text-left overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                  <span className="material-symbols-outlined text-[100px]">account_tree</span>
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center mb-5 border border-[#44484f]/20">
                    <span className="material-symbols-outlined text-primary">schema</span>
                  </div>
                  <h3 className="text-xl font-headline font-bold mb-2">Prisma Schema</h3>
                  <p className="text-on-surface-variant text-sm mb-5 max-w-[280px]">
                    Import your .prisma file to automatically generate relational synthetic snapshots.
                  </p>
                  <div className="flex items-center gap-2 text-primary font-label text-[11px] font-bold tracking-widest uppercase">
                    Import Schema
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </div>
                </div>
              </button>

              {/* SQL DDL */}
              <button
                onClick={() => setModalMode('sql')}
                className="group relative p-8 bg-surface-container rounded-xl border border-[#44484f]/10 hover:border-tertiary/40 transition-all duration-300 text-left overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                  <span className="material-symbols-outlined text-[100px]">database</span>
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center mb-5 border border-[#44484f]/20">
                    <span className="material-symbols-outlined text-tertiary">terminal</span>
                  </div>
                  <h3 className="text-xl font-headline font-bold mb-2">SQL DDL</h3>
                  <p className="text-on-surface-variant text-sm mb-5 max-w-[280px]">
                    Paste raw SQL definitions or upload .sql dumps for instant entity mapping.
                  </p>
                  <div className="flex items-center gap-2 text-tertiary font-label text-[11px] font-bold tracking-widest uppercase">
                    Upload Script
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </div>
                </div>
              </button>
            </div>
          </section>

          {/* Projects Table */}
          <section className="px-8 pb-20">
            <div className="flex items-center justify-between mb-7">
              <div className="flex items-center gap-3">
                <h2 className="font-headline text-2xl font-bold">Recent Projects</h2>
                <span className="px-2 py-0.5 bg-surface-container-highest rounded font-label text-[10px] text-on-surface-variant">
                  {projects.length.toString().padStart(2, '0')} TOTAL
                </span>
              </div>
            </div>

            {error && (
              <div className="mb-6 bg-error/10 border border-error/30 rounded-lg px-4 py-3 text-sm text-error font-label">
                {error}
              </div>
            )}

            <div className="bg-surface-container rounded-xl border border-[#44484f]/10 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-12 px-6 py-4 bg-surface-container-high border-b border-[#44484f]/10 font-label text-[10px] tracking-widest uppercase text-on-surface-variant">
                <div className="col-span-5">Project Name</div>
                <div className="col-span-3 text-center">Tables</div>
                <div className="col-span-2 text-right">Last Sync</div>
                <div className="col-span-2 text-right">Action</div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16 gap-3 text-on-surface-variant font-label text-[11px] uppercase tracking-widest">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Initializing clusters...
                </div>
              ) : projects.length === 0 ? (
                <div className="text-center py-16">
                  <span className="material-symbols-outlined text-[40px] text-on-surface-variant/30 block mb-3">folder_open</span>
                  <p className="text-sm font-label uppercase tracking-widest text-on-surface-variant/60">No projects yet</p>
                  <p className="text-xs text-on-surface-variant/40 mt-1 font-label">
                    Create a new project or import from Prisma / SQL above
                  </p>
                </div>
              ) : (
                projects.map((project, i) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    isLast={i === projects.length - 1}
                    onOpen={() => navigate(`/projects/${project.id}/tables`)}
                    onDelete={() => handleDelete(project.id)}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </main>

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

// ─── Project Row ──────────────────────────────────────────────────────────────

interface RowProps {
  project: Project;
  isLast: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

function ProjectRow({ project, isLast, onOpen, onDelete }: RowProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    try { await onDelete(); } finally { setDeleting(false); }
  }

  const statusColors = ['bg-tertiary', 'bg-primary', 'bg-on-surface-variant', 'bg-error'];
  const dotColor = statusColors[project.id.charCodeAt(0) % statusColors.length];

  return (
    <div
      onClick={onOpen}
      className={`grid grid-cols-12 px-6 py-5 hover:bg-[#262c36]/30 transition-colors cursor-pointer items-center group ${!isLast ? 'border-b border-[#44484f]/5' : ''}`}
    >
      <div className="col-span-5 flex items-center gap-4">
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <div className="min-w-0">
          <div className="font-bold text-sm truncate">{project.name}</div>
          <div className="text-[10px] text-on-surface-variant font-label mt-0.5">
            ID: {project.id.slice(0, 12)}
          </div>
        </div>
      </div>

      <div className="col-span-3 flex justify-center">
        <span className="px-3 py-1 bg-surface-variant rounded text-[11px] font-label text-on-surface">
          {project.tables.length} TABLE{project.tables.length !== 1 ? 'S' : ''}
        </span>
      </div>

      <div className="col-span-2 text-right text-on-surface-variant text-[11px] font-label">
        {new Date(project.updatedAt).toLocaleDateString()}
      </div>

      <div className="col-span-2 flex items-center justify-end gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="flex items-center gap-1 text-[11px] font-label text-primary hover:underline uppercase tracking-widest"
        >
          Open
          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-error transition-all"
        >
          {deleting
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <span className="material-symbols-outlined text-[18px]">delete</span>
          }
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
    mode === 'prisma' ? 'Paste your .prisma schema here...' :
    mode === 'sql' ? 'Paste your CREATE TABLE SQL here...' : '';

  async function handleSubmit() {
    if (!projectName.trim()) { setError('Project name is required'); return; }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-surface-container border border-[#44484f]/30 rounded-xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#44484f]/20">
          <div>
            <h2 className="font-headline font-bold">{title}</h2>
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mt-0.5">
              {mode === 'manual' ? 'Create empty project' : 'Parse schema & initialize tables'}
            </p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-error/10 border border-error/30 rounded-lg px-3 py-2 text-sm text-error font-label">
              {error}
            </div>
          )}
          <div>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1.5">
              Project Name
            </label>
            <input
              className="w-full bg-surface-container-low border border-[#44484f]/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-on-surface placeholder:text-on-surface-variant/50"
              placeholder="e.g. customer_loyalty_v2"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && mode === 'manual' && handleSubmit()}
              autoFocus
            />
          </div>

          {mode !== 'manual' && (
            <div>
              <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1.5">
                {mode === 'prisma' ? 'Prisma Schema' : 'SQL DDL'}
              </label>
              <textarea
                className="w-full bg-surface-container-low border border-[#44484f]/30 rounded-lg px-3 py-2.5 text-sm font-label focus:outline-none focus:ring-1 focus:ring-primary resize-none text-on-surface placeholder:text-on-surface-variant/50"
                placeholder={placeholder}
                rows={10}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#44484f]/20">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface border border-[#44484f]/30 rounded-lg transition-colors font-label uppercase tracking-widest text-[11px]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !projectName.trim()}
            className="flex items-center gap-2 bg-primary text-on-primary-fixed px-5 py-2.5 rounded-lg text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-all font-headline"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {mode === 'manual' ? 'Create Project' : 'Parse & Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
