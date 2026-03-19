import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { nanoid } from 'nanoid';
import { getProject, updateProject } from '../api/client.js';
import type { DatasetSchema, ProjectTab } from '../types/index.js';
import { useProjectStore } from '../store/projectStore.js';
import { useAppStore } from '../store/appStore.js';
import { TableSidebar } from '../components/project/TableSidebar.js';
import { DiagramView } from '../components/project/DiagramView.js';
import { MultiTableGenerate } from '../components/project/MultiTableGenerate.js';
import { MultiTableExport } from '../components/project/MultiTableExport.js';
import { SchemaEditor } from '../components/schema/SchemaEditor.js';

interface Props {
  projectId: string;
  onBack: () => void;
}

const TABS: { id: ProjectTab; label: string }[] = [
  { id: 'tables', label: 'Tables' },
  { id: 'diagram', label: 'Diagram' },
  { id: 'generate', label: 'Generate' },
  { id: 'export', label: 'Export' },
];

function makeEmptyTable(): DatasetSchema {
  return {
    id: nanoid(),
    name: 'new_table',
    columns: [],
    rules: [],
    sourceType: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function ProjectEditor({ projectId, onBack }: Props) {
  const {
    project,
    activeTableId,
    activeTab,
    setProject,
    setActiveTableId,
    setActiveTab,
    updateTable,
    addTable,
    removeTable,
    reset,
  } = useProjectStore();

  // AppStore is used by the embedded SchemaEditor for single-table editing
  const { setSchema, schema: appSchema } = useAppStore();

  const [projectName, setProjectName] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load project on mount
  useEffect(() => {
    reset();
    setLoading(true);
    getProject(projectId)
      .then((p) => {
        setProject(p);
        setProjectName(p.name);
        if (p.tables.length > 0) {
          setActiveTableId(p.tables[0].id);
        }
      })
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Sync active table to AppStore's schema for SchemaEditor
  useEffect(() => {
    if (!project || !activeTableId) return;
    const table = project.tables.find((t) => t.id === activeTableId);
    if (table) {
      // Mark as server-saved so SchemaEditor uses updateSchema instead of saveSchema
      setSchema(table, true);
    }
  }, [activeTableId, project, setSchema]);

  // Sync AppStore schema changes back to ProjectStore
  useEffect(() => {
    if (!appSchema || !activeTableId) return;
    if (appSchema.id !== activeTableId) return;
    updateTable(appSchema);
    // We want this to run whenever appSchema changes (column edits, etc.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSchema]);

  const handleAddTable = useCallback(() => {
    const table = makeEmptyTable();
    addTable(table);
  }, [addTable]);

  const handleDeleteTable = useCallback(
    (id: string) => {
      removeTable(id);
    },
    [removeTable],
  );

  async function handleSave() {
    if (!project) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateProject(project.id, projectName.trim() || project.name, project.tables);
      setProject(updated);
      setProjectName(updated.name);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const handleTableClick = useCallback(
    (tableId: string) => {
      setActiveTab('tables');
      setActiveTableId(tableId);
    },
    [setActiveTab, setActiveTableId],
  );

  // Loading / error states
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading project...
      </div>
    );
  }

  if (loadError || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <p className="text-destructive text-sm">{loadError ?? 'Project not found'}</p>
        <button onClick={onBack} className="text-sm text-primary hover:underline">
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card/50">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Projects
        </button>

        <span className="text-border">|</span>

        {/* Editable project name */}
        <input
          className="bg-transparent text-sm font-semibold focus:outline-none focus:border-b focus:border-primary min-w-0 flex-1 max-w-xs"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />

        <span className="text-xs text-muted-foreground hidden sm:block">
          {project.tables.length} {project.tables.length === 1 ? 'table' : 'tables'}
        </span>

        {/* Tab switcher */}
        <nav className="flex items-center gap-1 mx-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary/20 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </header>

      {saveError && (
        <div className="shrink-0 mx-4 mt-2 bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 text-xs text-destructive">
          {saveError}
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {/* Tables tab: sidebar + SchemaEditor */}
        {activeTab === 'tables' && (
          <div className="flex h-full">
            <TableSidebar
              tables={project.tables}
              activeTableId={activeTableId}
              onSelectTable={(id) => setActiveTableId(id)}
              onAddTable={handleAddTable}
              onDeleteTable={handleDeleteTable}
            />

            <div className="flex-1 overflow-hidden">
              {activeTableId && project.tables.find((t) => t.id === activeTableId) ? (
                <SchemaEditor />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  {project.tables.length === 0
                    ? 'Add a table to get started'
                    : 'Select a table from the sidebar'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Diagram tab */}
        {activeTab === 'diagram' && (
          <div className="h-full">
            <DiagramView onTableClick={handleTableClick} onAddTable={handleAddTable} />
          </div>
        )}

        {/* Generate tab */}
        {activeTab === 'generate' && (
          <div className="h-full overflow-auto">
            <MultiTableGenerate />
          </div>
        )}

        {/* Export tab */}
        {activeTab === 'export' && (
          <div className="h-full overflow-auto">
            <MultiTableExport />
          </div>
        )}
      </main>
    </div>
  );
}
