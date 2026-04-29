import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, Upload } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { nanoid } from 'nanoid';
import {
  listProjects, createProject, deleteProject, inferFromPrisma, inferProjectFromSql,
  inferFromCsv, duplicateProject, updateProject,
} from '../api/client.js';
import type { Project } from '../types/index.js';
import { Sidebar } from '../components/layout/Sidebar.js';

type ModalMode = 'manual' | 'prisma' | 'sql' | 'csv' | null;

export function ProjectList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleDelete(id: string) {
    await deleteProject(id);
    setProjects((ps) => ps.filter((p) => p.id !== id));
  }

  async function handleDuplicate(id: string) {
    const copy = await duplicateProject(id);
    setProjects((ps) => [copy, ...ps]);
  }

  async function handleRename(id: string, name: string) {
    const project = projects.find(p => p.id === id);
    if (!project || !name.trim() || name.trim() === project.name) return;
    const updated = await updateProject(id, name.trim(), project.tables);
    setProjects(ps => ps.map(p => p.id === id ? updated : p));
  }

  function handleCreated(project: Project) {
    navigate(`/projects/${project.id}/tables`);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar onNewProject={() => setModalMode('manual')} />

      <main className="flex-1 ml-64 flex flex-col overflow-hidden">
        {/* Top Nav */}
        <header className="flex items-center justify-between px-8 w-full h-16 sticky top-0 z-50 bg-surface/80 backdrop-blur-md border-b border-surface-container shrink-0">
          <div className="flex items-center flex-1 max-w-xl">
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
              <input
                className="bg-surface-container-low border-none rounded-md py-2 pl-10 pr-4 text-sm w-full focus:ring-1 focus:ring-tertiary placeholder:text-on-surface-variant/50 font-body outline-none"
                placeholder="Search projects..."
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 ml-8">
            <button className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-bright rounded-md transition-all duration-300">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-bright rounded-md transition-all duration-300">
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
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-surface-container border border-outline-variant/20 rounded-full mb-6">
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
                <button
                  onClick={() => navigate('/single')}
                  className="px-7 py-3.5 bg-surface-container border border-outline-variant/30 text-on-surface font-headline font-bold text-sm rounded-md hover:bg-surface-bright transition-all"
                >
                  SINGLE TABLE
                </button>
              </div>
            </div>
          </section>

          {/* Quick Import */}
          <section className="px-8 mb-14">
            <div className="flex items-center gap-3 mb-7">
              <h2 className="font-headline text-2xl font-bold">Quick Import</h2>
              <div className="h-px flex-1 bg-gradient-to-r from-outline-variant/30 to-transparent" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Prisma */}
              <button
                onClick={() => setModalMode('prisma')}
                className="group relative p-8 bg-surface-container rounded-xl border border-outline-variant/10 hover:border-primary/40 transition-all duration-300 text-left overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                  <span className="material-symbols-outlined text-[100px]">account_tree</span>
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center mb-5 border border-outline-variant/20">
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
                className="group relative p-8 bg-surface-container rounded-xl border border-outline-variant/10 hover:border-tertiary/40 transition-all duration-300 text-left overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                  <span className="material-symbols-outlined text-[100px]">database</span>
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center mb-5 border border-outline-variant/20">
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

              {/* CSV */}
              <button
                onClick={() => setModalMode('csv')}
                className="group relative p-8 bg-surface-container rounded-xl border border-outline-variant/10 hover:border-tertiary/40 transition-all duration-300 text-left overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                  <span className="material-symbols-outlined text-[100px]">table_view</span>
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center mb-5 border border-outline-variant/20">
                    <Upload className="w-5 h-5 text-tertiary" />
                  </div>
                  <h3 className="text-xl font-headline font-bold mb-2">CSV Upload</h3>
                  <p className="text-on-surface-variant text-sm mb-5 max-w-[280px]">
                    Upload a CSV file and auto-detect column types to seed a single-table project.
                  </p>
                  <div className="flex items-center gap-2 text-tertiary font-label text-[11px] font-bold tracking-widest uppercase">
                    Upload File
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
                  {filteredProjects.length.toString().padStart(2, '0')} {searchQuery ? 'FOUND' : 'TOTAL'}
                </span>
              </div>
            </div>

            {error && (
              <div className="mb-6 bg-error/10 border border-error/30 rounded-lg px-4 py-3 text-sm text-error font-label">
                {error}
              </div>
            )}

            <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-12 px-6 py-4 bg-surface-container-high border-b border-outline-variant/10 font-label text-[10px] tracking-widest uppercase text-on-surface-variant">
                <div className="col-span-5">Project Name</div>
                <div className="col-span-2 text-center">Tables</div>
                <div className="col-span-3 text-right">Last Sync</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16 gap-3 text-on-surface-variant font-label text-[11px] uppercase tracking-widest">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Initializing clusters...
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="text-center py-16">
                  <span className="material-symbols-outlined text-[40px] text-on-surface-variant/30 block mb-3">folder_open</span>
                  {searchQuery ? (
                    <>
                      <p className="text-sm font-label uppercase tracking-widest text-on-surface-variant/60">No projects match "{searchQuery}"</p>
                      <button
                        onClick={() => setSearchQuery('')}
                        className="mt-3 text-[10px] font-label uppercase tracking-widest text-primary hover:underline"
                      >
                        Clear search
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-label uppercase tracking-widest text-on-surface-variant/60">No projects yet</p>
                      <button
                        onClick={() => setModalMode('manual')}
                        className="mt-4 px-5 py-2.5 bg-primary text-on-primary-fixed font-headline font-bold text-xs uppercase tracking-widest rounded-md hover:brightness-110 transition-all"
                      >
                        Create First Project
                      </button>
                    </>
                  )}
                </div>
              ) : (
                filteredProjects.map((project, i) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    isLast={i === filteredProjects.length - 1}
                    onOpen={() => navigate(`/projects/${project.id}/tables`)}
                    onDelete={() => handleDelete(project.id)}
                    onDuplicate={() => handleDuplicate(project.id)}
                    onRename={(name) => handleRename(project.id, name)}
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
  onDuplicate: () => void;
  onRename: (name: string) => void;
}

function ProjectRow({ project, isLast, onOpen, onDelete, onDuplicate, onRename }: RowProps) {
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  function startRename(e: React.MouseEvent) {
    e.stopPropagation();
    setNameInput(project.name);
    setRenaming(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitRename() {
    setRenaming(false);
    onRename(nameInput);
  }

  function cancelRename() {
    setRenaming(false);
    setNameInput(project.name);
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    try { await onDelete(); } finally { setDeleting(false); }
  }

  async function handleDuplicate(e: React.MouseEvent) {
    e.stopPropagation();
    setDuplicating(true);
    try { await onDuplicate(); } finally { setDuplicating(false); }
  }

  const statusColors = ['bg-tertiary', 'bg-primary', 'bg-on-surface-variant', 'bg-error'];
  const dotColor = statusColors[project.id.charCodeAt(0) % statusColors.length];

  return (
    <div
      onClick={renaming ? undefined : onOpen}
      className={`grid grid-cols-12 px-6 py-5 hover:bg-surface-bright/30 transition-colors ${!renaming ? 'cursor-pointer' : ''} items-center group ${!isLast ? 'border-b border-outline-variant/5' : ''}`}
    >
      <div className="col-span-5 flex items-center gap-4">
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              ref={inputRef}
              className="bg-surface-container-low border border-primary/50 rounded px-2 py-0.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-primary w-full max-w-xs"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') cancelRename();
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <div className="font-bold text-sm truncate">{project.name}</div>
          )}
          <div className="text-[10px] text-on-surface-variant font-label mt-0.5">
            ID: {project.id.slice(0, 12)}
          </div>
        </div>
      </div>

      <div className="col-span-2 flex justify-center">
        <span className="px-3 py-1 bg-surface-variant rounded text-[11px] font-label text-on-surface">
          {project.tables.length} TABLE{project.tables.length !== 1 ? 'S' : ''}
        </span>
      </div>

      <div className="col-span-3 text-right text-on-surface-variant text-[11px] font-label">
        {new Date(project.updatedAt).toLocaleDateString()}
      </div>

      <div className="col-span-2 flex items-center justify-end gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="flex items-center gap-1 text-[11px] font-label text-primary hover:underline uppercase tracking-widest"
        >
          Open
          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
        </button>

        {/* Rename */}
        <button
          onClick={startRename}
          title="Rename"
          className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-on-surface transition-all"
        >
          <span className="material-symbols-outlined text-[16px]">edit</span>
        </button>

        {/* Duplicate */}
        <button
          onClick={handleDuplicate}
          disabled={duplicating}
          title="Duplicate"
          className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-primary transition-all"
        >
          {duplicating
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <span className="material-symbols-outlined text-[16px]">content_copy</span>
          }
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Delete"
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
  mode: 'manual' | 'prisma' | 'sql' | 'csv';
  onClose: () => void;
  onCreated: (project: Project) => void;
}

function ImportModal({ mode, onClose, onCreated }: ModalProps) {
  const [projectName, setProjectName] = useState('');
  const [source, setSource] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    setCsvFile(file);
    if (!projectName) setProjectName(file.name.replace(/\.csv$/i, ''));
  }, [projectName]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt'] },
    maxFiles: 1,
    disabled: loading,
  });

  const title =
    mode === 'manual' ? 'New Project' :
    mode === 'prisma' ? 'Import Prisma Schema' :
    mode === 'sql' ? 'Import SQL DDL' :
    'Import CSV';

  const subtitle =
    mode === 'manual' ? 'Create empty project' :
    mode === 'csv' ? 'Infer schema from CSV file' :
    'Parse schema & initialize tables';

  async function handleSubmit() {
    if (!projectName.trim()) { setError('Project name is required'); return; }
    if (mode === 'csv' && !csvFile) { setError('Please select a CSV file'); return; }
    setLoading(true);
    setError(null);
    try {
      let project: Project;
      if (mode === 'manual') {
        project = await createProject(projectName.trim(), []);
      } else if (mode === 'prisma') {
        project = await inferFromPrisma(source, projectName.trim());
      } else if (mode === 'sql') {
        project = await inferProjectFromSql(source, projectName.trim());
      } else {
        // CSV: infer single-table schema, wrap in a project
        const result = await inferFromCsv(csvFile!);
        const now = new Date().toISOString();
        const table = {
          id: nanoid(),
          name: projectName.trim().replace(/\s+/g, '_').toLowerCase(),
          columns: result.columns.map((c) => ({ ...c, id: nanoid() })),
          rules: [],
          sourceType: 'upload' as const,
          createdAt: now,
          updatedAt: now,
        };
        project = await createProject(projectName.trim(), [table]);
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
      <div className="bg-surface-container border border-outline-variant/30 rounded-xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <div>
            <h2 className="font-headline font-bold">{title}</h2>
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mt-0.5">
              {subtitle}
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
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-on-surface placeholder:text-on-surface-variant/50"
              placeholder="e.g. customer_loyalty_v2"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && mode === 'manual' && handleSubmit()}
              autoFocus
            />
          </div>

          {(mode === 'prisma' || mode === 'sql') && (
            <div>
              <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1.5">
                {mode === 'prisma' ? 'Prisma Schema' : 'SQL DDL'}
              </label>
              <textarea
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm font-label focus:outline-none focus:ring-1 focus:ring-primary resize-none text-on-surface placeholder:text-on-surface-variant/50"
                placeholder={
                  mode === 'prisma'
                    ? 'Paste your .prisma schema here...'
                    : 'Paste your CREATE TABLE SQL here...'
                }
                rows={10}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
          )}

          {mode === 'csv' && (
            <div>
              <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1.5">
                CSV File
              </label>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-tertiary bg-tertiary/5'
                    : csvFile
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-outline-variant/40 hover:border-primary/50'
                } ${loading ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <input {...getInputProps()} />
                {csvFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <span className="material-symbols-outlined text-primary text-2xl">table_view</span>
                    <div className="text-left">
                      <div className="text-sm font-bold text-on-surface">{csvFile.name}</div>
                      <div className="text-[10px] font-label text-on-surface-variant uppercase tracking-widest mt-0.5">
                        {(csvFile.size / 1024).toFixed(1)} KB — Click to change
                      </div>
                    </div>
                  </div>
                ) : isDragActive ? (
                  <p className="text-tertiary font-label text-[11px] uppercase tracking-widest">Drop CSV here</p>
                ) : (
                  <>
                    <Upload className="w-8 h-8 mx-auto mb-2 text-on-surface-variant/50" />
                    <p className="text-sm text-on-surface-variant mb-1">Drag & drop a CSV file</p>
                    <p className="text-[10px] font-label text-on-surface-variant/60 uppercase tracking-widest">or click to browse</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/20">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface border border-outline-variant/30 rounded-lg transition-colors font-label uppercase tracking-widest text-[11px]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !projectName.trim() || (mode === 'csv' && !csvFile)}
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
