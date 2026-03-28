import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  ReactFlowProvider,
} from '@xyflow/react';
import type { Connection, Edge, Node, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nanoid } from 'nanoid';
import { Plus, Maximize2, Trash2, Check, X } from 'lucide-react';
import type { ColumnSchema, DatasetSchema, ColumnDataType, IndexType } from '../../types/index.js';
import { useProjectStore } from '../../store/projectStore.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TableNodeData extends Record<string, unknown> {
  table: DatasetSchema;
  onTableClick: () => void;
}

type TableNodeType = Node<TableNodeData>;
type DiagramEdge = Edge;

// ─── TableNode ────────────────────────────────────────────────────────────────

function TableNode({ data }: NodeProps<TableNodeType>) {
  const { table, onTableClick } = data;

  return (
    <div
      className="bg-card border border-border rounded-lg overflow-hidden shadow-lg min-w-[190px] cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onTableClick as React.MouseEventHandler}
    >
      {/* Header */}
      <div className="bg-muted/80 px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold font-mono text-foreground">{table.name}</span>
      </div>

      {/* Columns */}
      <div className="py-1">
        {table.columns.map((col) => {
          const isPK = col.indexType === 'primary_key';
          const isFK = col.indexType === 'foreign_key';
          const isUQ = col.indexType === 'unique';
          const handleId = `${table.id}__${col.id}`;

          return (
            <div
              key={col.id}
              className="relative flex items-center gap-2 px-3 py-1 hover:bg-muted/30 transition-colors"
            >
              {/* Target handle: all non-PK columns can receive a FK drag */}
              {!isPK && (
                <Handle
                  type="target"
                  position={Position.Left}
                  id={handleId}
                  style={{
                    background: isFK ? '#6366f1' : '#475569',
                    width: 8, height: 8, left: -4,
                    opacity: isFK ? 1 : 0.45,
                  }}
                />
              )}

              {/* Icon */}
              <span className="text-[11px] shrink-0">
                {isPK ? '🔑' : isFK ? '🔗' : isUQ ? '◇' : '·'}
              </span>

              {/* Column name */}
              <span
                className={`text-xs font-mono truncate flex-1 ${
                  isPK ? 'text-yellow-400 font-semibold' : isFK ? 'text-blue-400' : 'text-foreground'
                }`}
              >
                {col.name}
              </span>

              {/* Data type */}
              <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                {col.dataType}
              </span>

              {/* Source handle: PK columns can be dragged FROM */}
              {isPK && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={handleId}
                  style={{ background: '#eab308', width: 8, height: 8, right: -4 }}
                />
              )}
            </div>
          );
        })}

        {table.columns.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground italic">No columns</div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { tableNode: TableNode } as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COLS = 3;
const H_GAP = 260;
const V_GAP = 320;

function buildNodes(
  tables: DatasetSchema[],
  onTableClick: (tableId: string) => void,
): TableNodeType[] {
  return tables.map((table, i) => ({
    id: table.id,
    type: 'tableNode' as const,
    position: { x: (i % COLS) * H_GAP, y: Math.floor(i / COLS) * V_GAP },
    data: {
      table,
      onTableClick: () => onTableClick(table.id),
    },
  }));
}

function buildEdges(tables: DatasetSchema[]): DiagramEdge[] {
  const edges: DiagramEdge[] = [];
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.indexType === 'foreign_key' && col.generatorConfig.poolRef) {
        const [refTableName, refColName] = col.generatorConfig.poolRef.split('.');
        if (!refTableName || !refColName) continue;
        const refTable = tables.find((t) => t.name === refTableName);
        if (!refTable) continue;
        const refCol = refTable.columns.find((c) => c.name === refColName);
        if (!refCol) continue;

        const cfg = col.generatorConfig;
        const edgeLabel =
          cfg.fkDistribution === 'fixed_per_parent' && cfg.fkChildrenPerParent
            ? `×${cfg.fkChildrenPerParent.min}–${cfg.fkChildrenPerParent.max}`
            : 'FK';

        edges.push({
          id: `${table.id}-${col.id}`,
          source: refTable.id,
          sourceHandle: `${refTable.id}__${refCol.id}`,
          target: table.id,
          targetHandle: `${table.id}__${col.id}`,
          animated: true,
          label: edgeLabel,
          style: { stroke: '#6366f1' },
          labelStyle: { fill: '#a5b4fc', fontSize: 10 },
        });
      }
    }
  }
  return edges;
}

// ─── Add-Table inline form ────────────────────────────────────────────────────

type NewCol = { id: string; name: string; dataType: ColumnDataType; indexType: IndexType };

const DATA_TYPES: ColumnDataType[] = ['integer', 'float', 'string', 'boolean', 'date', 'uuid', 'enum'];
const INDEX_TYPES: { value: IndexType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'primary_key', label: 'PK' },
  { value: 'foreign_key', label: 'FK' },
  { value: 'unique', label: 'UQ' },
];

function makeDefaultColumn(indexType: IndexType = 'none'): NewCol {
  return { id: nanoid(), name: '', dataType: 'string', indexType };
}

interface AddTableFormProps {
  onAdd: (table: DatasetSchema) => void;
  onCancel: () => void;
}

function AddTableForm({ onAdd, onCancel }: AddTableFormProps) {
  const [name, setName] = useState('');
  const [cols, setCols] = useState<NewCol[]>([
    { id: nanoid(), name: 'id', dataType: 'integer', indexType: 'primary_key' },
  ]);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function addCol() {
    setCols(prev => [...prev, makeDefaultColumn()]);
  }

  function removeCol(id: string) {
    setCols(prev => prev.filter(c => c.id !== id));
  }

  function updateCol(id: string, patch: Partial<NewCol>) {
    setCols(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  function handleCreate() {
    const tableName = name.trim() || 'new_table';
    const columns: ColumnSchema[] = cols
      .filter(c => c.name.trim())
      .map(c => ({
        id: nanoid(),
        name: c.name.trim(),
        dataType: c.dataType,
        indexType: c.indexType,
        notNull: c.indexType === 'primary_key',
        generatorConfig: { locale: 'en' },
        poolName: c.indexType === 'primary_key' ? c.name.trim() : undefined,
      }));

    const table: DatasetSchema = {
      id: nanoid(),
      name: tableName,
      columns,
      rules: [],
      sourceType: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onAdd(table);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
  }

  return (
    <div
      className="absolute top-3 left-3 z-20 bg-card border border-border rounded-xl shadow-2xl w-80 overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
        <span className="text-xs font-semibold">New Table</span>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Table name */}
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Table name
          </label>
          <input
            ref={nameRef}
            className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. orders"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
        </div>

        {/* Columns */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Columns
            </label>
            <button
              onClick={addCol}
              className="flex items-center gap-1 text-[10px] text-primary hover:underline"
            >
              <Plus className="w-3 h-3" /> Add column
            </button>
          </div>

          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {cols.map((col) => (
              <div key={col.id} className="flex items-center gap-1.5">
                {/* Name */}
                <input
                  className="flex-1 min-w-0 bg-background border border-border rounded-md px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="column_name"
                  value={col.name}
                  onChange={e => updateCol(col.id, { name: e.target.value })}
                />
                {/* Type */}
                <select
                  className="bg-background border border-border rounded-md px-1 py-1 text-xs focus:outline-none w-20"
                  value={col.dataType}
                  onChange={e => updateCol(col.id, { dataType: e.target.value as ColumnDataType })}
                >
                  {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {/* Index */}
                <select
                  className="bg-background border border-border rounded-md px-1 py-1 text-xs focus:outline-none w-14"
                  value={col.indexType}
                  onChange={e => updateCol(col.id, { indexType: e.target.value as IndexType })}
                >
                  {INDEX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {/* Remove */}
                <button
                  onClick={() => removeCol(col.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex gap-2 px-4 py-3 border-t border-border">
        <button
          onClick={onCancel}
          className="flex-1 py-1.5 rounded-lg text-xs border border-border hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!name.trim() && cols.every(c => !c.name.trim())}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Check className="w-3 h-3" /> Create Table
        </button>
      </div>
    </div>
  );
}

// ─── Inner flow component (needs ReactFlowProvider context) ───────────────────

interface FlowProps {
  tables: DatasetSchema[];
  onTableClick: (tableId: string) => void;
  addTable: (table: DatasetSchema) => void;
  updateTable: (table: DatasetSchema) => void;
}

function DiagramFlow({ tables, onTableClick, addTable, updateTable }: FlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeType>(
    buildNodes(tables, onTableClick),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<DiagramEdge>(buildEdges(tables));
  const [showAddForm, setShowAddForm] = useState(false);

  // Rebuild nodes/edges when tables change
  useEffect(() => {
    setNodes(buildNodes(tables, onTableClick));
    setEdges(buildEdges(tables));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.sourceHandle || !connection.targetHandle) return;

      const [srcTableId, srcColId] = connection.sourceHandle.split('__');
      const [tgtTableId, tgtColId] = connection.targetHandle.split('__');

      if (!srcTableId || !srcColId || !tgtTableId || !tgtColId) return;
      if (srcTableId === tgtTableId && srcColId === tgtColId) return;

      const srcTable = tables.find((t) => t.id === srcTableId);
      const tgtTable = tables.find((t) => t.id === tgtTableId);
      if (!srcTable || !tgtTable) return;

      const srcCol = srcTable.columns.find((c) => c.id === srcColId);
      const tgtCol = tgtTable.columns.find((c) => c.id === tgtColId);
      if (!srcCol || !tgtCol) return;

      // Only allow dragging from PK columns
      if (srcCol.indexType !== 'primary_key') return;

      const updatedCol = {
        ...tgtCol,
        indexType: 'foreign_key' as const,
        generatorConfig: {
          ...tgtCol.generatorConfig,
          poolRef: `${srcTable.name}.${srcCol.name}`,
        },
      };
      updateTable({
        ...tgtTable,
        columns: tgtTable.columns.map((c) => (c.id === tgtColId ? updatedCol : c)),
      });

      setEdges((eds) =>
        addEdge(
          { ...connection, animated: true, label: 'FK', style: { stroke: '#6366f1' }, labelStyle: { fill: '#a5b4fc', fontSize: 10 } },
          eds,
        ),
      );
    },
    [tables, updateTable, setEdges],
  );

  function handleAdd(table: DatasetSchema) {
    addTable(table);
    setShowAddForm(false);
  }

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        style={{ background: 'hsl(var(--background))' }}
      >
        <Background color="hsl(var(--border))" gap={20} />
        <Controls />
        <MiniMap
          nodeColor="#1e293b"
          maskColor="rgba(0,0,0,0.4)"
          style={{ background: 'hsl(var(--card))' }}
        />
      </ReactFlow>

      {/* Add table button / inline form */}
      {showAddForm ? (
        <AddTableForm
          onAdd={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <div className="absolute top-3 left-3 z-10">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Table
          </button>
        </div>
      )}

      <div className="absolute top-3 right-3 z-10">
        <button
          onClick={() => {
            const btn = document.querySelector<HTMLButtonElement>('.react-flow__controls-fitview');
            btn?.click();
          }}
          className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors shadow"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Fit View
        </button>
      </div>

      {/* Drag hint */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <span className="text-[10px] text-muted-foreground bg-card/70 border border-border px-2 py-1 rounded-full">
          Drag 🔑 PK handle → column to create FK relationship
        </span>
      </div>
    </div>
  );
}

// ─── DiagramView (public component) ──────────────────────────────────────────

interface Props {
  onTableClick: (tableId: string) => void;
  onAddTable: () => void;
}

export function DiagramView({ onTableClick }: Props) {
  const { project, updateTable, addTable } = useProjectStore();
  const tables = project?.tables ?? [];

  return (
    <ReactFlowProvider>
      <DiagramFlow
        tables={tables}
        onTableClick={onTableClick}
        addTable={addTable}
        updateTable={updateTable}
      />
    </ReactFlowProvider>
  );
}
