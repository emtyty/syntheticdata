import { useCallback, useEffect } from 'react';
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
import { Plus, Maximize2 } from 'lucide-react';
import type { DatasetSchema } from '../../types/index.js';
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
      className="bg-card border border-border rounded-lg overflow-hidden shadow-lg min-w-[180px] cursor-pointer hover:border-primary/50 transition-colors"
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
              {/* FK target handle (left side) */}
              {isFK && (
                <Handle
                  type="target"
                  position={Position.Left}
                  id={handleId}
                  style={{ background: '#6366f1', width: 8, height: 8, left: -4 }}
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

              {/* PK source handle (right side) */}
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

        edges.push({
          id: `${table.id}-${col.id}`,
          source: refTable.id,
          sourceHandle: `${refTable.id}__${refCol.id}`,
          target: table.id,
          targetHandle: `${table.id}__${col.id}`,
          animated: true,
          label: 'FK',
          style: { stroke: '#6366f1' },
          labelStyle: { fill: '#a5b4fc', fontSize: 10 },
        });
      }
    }
  }
  return edges;
}

// ─── Inner flow component (needs ReactFlowProvider context) ───────────────────

interface FlowProps {
  tables: DatasetSchema[];
  onTableClick: (tableId: string) => void;
  onAddTable: () => void;
  updateTable: (table: DatasetSchema) => void;
}

function DiagramFlow({ tables, onTableClick, onAddTable, updateTable }: FlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeType>(
    buildNodes(tables, onTableClick),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<DiagramEdge>(buildEdges(tables));

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

      const srcTable = tables.find((t) => t.id === srcTableId);
      const tgtTable = tables.find((t) => t.id === tgtTableId);
      if (!srcTable || !tgtTable) return;

      const srcCol = srcTable.columns.find((c) => c.id === srcColId);
      const tgtCol = tgtTable.columns.find((c) => c.id === tgtColId);
      if (!srcCol || !tgtCol) return;

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
          { ...connection, animated: true, label: 'FK', style: { stroke: '#6366f1' } },
          eds,
        ),
      );
    },
    [tables, updateTable, setEdges],
  );

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

      {/* Overlay buttons */}
      <div className="absolute top-3 left-3 z-10">
        <button
          onClick={onAddTable}
          className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors shadow"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Table
        </button>
      </div>

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
    </div>
  );
}

// ─── DiagramView (public component) ──────────────────────────────────────────

interface Props {
  onTableClick: (tableId: string) => void;
  onAddTable: () => void;
}

export function DiagramView({ onTableClick, onAddTable }: Props) {
  const { project, updateTable } = useProjectStore();
  const tables = project?.tables ?? [];

  return (
    <ReactFlowProvider>
      <DiagramFlow
        tables={tables}
        onTableClick={onTableClick}
        onAddTable={onAddTable}
        updateTable={updateTable}
      />
    </ReactFlowProvider>
  );
}
