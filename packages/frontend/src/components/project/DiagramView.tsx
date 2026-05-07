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
import dagre from '@dagrejs/dagre';
import { nanoid } from 'nanoid';
import { Plus, Maximize2, Trash2, Check, X, LayoutGrid, Download, Copy } from 'lucide-react';
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

// Approximate rendered size of a TableNode for dagre. Header is ~36px, each
// column row ~24px, plus a few px of padding. Width roughly matches min-w-[190px]
// plus column-name + type. Disconnected components stack vertically below the
// main hierarchy; dagre positions them automatically given the rankdir.
const NODE_WIDTH = 220;
function nodeHeight(columnCount: number): number {
  return 40 + Math.max(columnCount, 1) * 24 + 8;
}

function layoutWithDagre(
  tables: DatasetSchema[],
  rankdir: 'TB' | 'LR' = 'LR',
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, nodesep: 60, ranksep: 100, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const table of tables) {
    g.setNode(table.id, { width: NODE_WIDTH, height: nodeHeight(table.columns.length) });
  }
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.indexType !== 'foreign_key' || !col.generatorConfig.poolRef) continue;
      const refTableName = col.generatorConfig.poolRef.split('.')[0];
      const refTable = tables.find((t) => t.name === refTableName);
      if (!refTable || refTable.id === table.id) continue;
      g.setEdge(refTable.id, table.id);
    }
  }

  dagre.layout(g);

  // dagre returns center-points; React Flow uses top-left, so shift by half size.
  const positions = new Map<string, { x: number; y: number }>();
  for (const table of tables) {
    const n = g.node(table.id);
    if (!n) continue;
    positions.set(table.id, {
      x: n.x - NODE_WIDTH / 2,
      y: n.y - nodeHeight(table.columns.length) / 2,
    });
  }
  return positions;
}

function buildNodes(
  tables: DatasetSchema[],
  onTableClick: (tableId: string) => void,
  positions: Map<string, { x: number; y: number }>,
): TableNodeType[] {
  return tables.map((table) => ({
    id: table.id,
    type: 'tableNode' as const,
    position: positions.get(table.id) ?? { x: 0, y: 0 },
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

// ─── Custom SVG export ────────────────────────────────────────────────────────
// Render the diagram directly from schema data. The visual style is fixed, so
// emitting hand-written SVG is far smaller and cleaner than capturing the live
// DOM with html-to-image (which inlines computed cssText, theme tokens, and
// @font-face data on every element).

const SVG_NODE_WIDTH = 220;
const SVG_HEADER_HEIGHT = 32;
const SVG_ROW_HEIGHT = 24;
const SVG_CARD_RADIUS = 6;
const SVG_NODE_PADDING_Y = 4;
const SVG_EXPORT_PADDING = 40;
const SVG_FONT = "ui-monospace, Menlo, Consolas, 'Courier New', monospace";

function svgTableHeight(columnCount: number): number {
  return SVG_HEADER_HEIGHT + Math.max(columnCount, 1) * SVG_ROW_HEIGHT + SVG_NODE_PADDING_Y * 2;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface BuiltSvg { svg: string; width: number; height: number }

function buildExportSvg(
  tables: DatasetSchema[],
  positions: Map<string, { x: number; y: number }>,
): BuiltSvg {
  // Compute bounds across all tables
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of tables) {
    const p = positions.get(t.id) ?? { x: 0, y: 0 };
    const h = svgTableHeight(t.columns.length);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x + SVG_NODE_WIDTH > maxX) maxX = p.x + SVG_NODE_WIDTH;
    if (p.y + h > maxY) maxY = p.y + h;
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }

  const width = Math.ceil(maxX - minX + SVG_EXPORT_PADDING * 2);
  const height = Math.ceil(maxY - minY + SVG_EXPORT_PADDING * 2);
  const ox = SVG_EXPORT_PADDING - minX;
  const oy = SVG_EXPORT_PADDING - minY;

  // Per-column row Y center, indexed by `${tableId}__${colId}`
  const colCenter = new Map<string, number>();
  for (const t of tables) {
    const p = positions.get(t.id) ?? { x: 0, y: 0 };
    t.columns.forEach((c, i) => {
      const yCenter = p.y + SVG_HEADER_HEIGHT + SVG_NODE_PADDING_Y + i * SVG_ROW_HEIGHT + SVG_ROW_HEIGHT / 2;
      colCenter.set(`${t.id}__${c.id}`, yCenter);
    });
  }

  // Edges (drawn under nodes)
  const edgeParts: string[] = [];
  for (const t of tables) {
    const p = positions.get(t.id);
    if (!p) continue;
    for (const col of t.columns) {
      if (col.indexType !== 'foreign_key' || !col.generatorConfig.poolRef) continue;
      const [refTableName, refColName] = col.generatorConfig.poolRef.split('.');
      if (!refTableName || !refColName) continue;
      const refTable = tables.find((rt) => rt.name === refTableName);
      if (!refTable) continue;
      const refCol = refTable.columns.find((c) => c.name === refColName);
      if (!refCol) continue;
      const refPos = positions.get(refTable.id);
      if (!refPos) continue;

      const sy = colCenter.get(`${refTable.id}__${refCol.id}`);
      const ty = colCenter.get(`${t.id}__${col.id}`);
      if (sy === undefined || ty === undefined) continue;

      const sx = refPos.x + SVG_NODE_WIDTH + ox;
      const tx = p.x + ox;
      const sY = sy + oy;
      const tY = ty + oy;
      const dx = Math.max(40, Math.abs(tx - sx) / 2);

      edgeParts.push(
        `<path d="M ${sx} ${sY} C ${sx + dx} ${sY} ${tx - dx} ${tY} ${tx} ${tY}" fill="none" stroke="#6366f1" stroke-width="1.5"/>`
      );

      const cfg = col.generatorConfig;
      const edgeLabel =
        cfg.fkDistribution === 'fixed_per_parent' && cfg.fkChildrenPerParent
          ? `×${cfg.fkChildrenPerParent.min}-${cfg.fkChildrenPerParent.max}`
          : 'FK';
      const lx = (sx + tx) / 2;
      const lY = (sY + tY) / 2;
      const labelW = Math.max(20, edgeLabel.length * 6 + 8);
      edgeParts.push(
        `<g transform="translate(${(lx - labelW / 2).toFixed(1)} ${(lY - 8).toFixed(1)})">` +
        `<rect width="${labelW}" height="16" rx="3" fill="#1e293b"/>` +
        `<text x="${labelW / 2}" y="11" text-anchor="middle" fill="#ffffff" font-size="9" font-family="${SVG_FONT}">${escapeXml(edgeLabel)}</text>` +
        `</g>`
      );
    }
  }

  // Nodes (table cards)
  const nodeParts: string[] = [];
  for (const t of tables) {
    const p = positions.get(t.id) ?? { x: 0, y: 0 };
    const x = p.x + ox;
    const y = p.y + oy;
    const h = svgTableHeight(t.columns.length);
    const W = SVG_NODE_WIDTH;
    const R = SVG_CARD_RADIUS;
    const HH = SVG_HEADER_HEIGHT;

    let g = `<g transform="translate(${x} ${y})">`;
    // Card body
    g += `<rect x="0" y="0" width="${W}" height="${h}" rx="${R}" ry="${R}" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>`;
    // Header bar (clipped to top of the rounded card)
    g += `<path d="M 0 ${R} A ${R} ${R} 0 0 1 ${R} 0 L ${W - R} 0 A ${R} ${R} 0 0 1 ${W} ${R} L ${W} ${HH} L 0 ${HH} Z" fill="#f1f5f9"/>`;
    g += `<line x1="0" y1="${HH}" x2="${W}" y2="${HH}" stroke="#e2e8f0"/>`;
    // Table name
    g += `<text x="12" y="${HH / 2 + 4}" font-family="${SVG_FONT}" font-size="11" font-weight="600" fill="#1e293b">${escapeXml(t.name)}</text>`;

    if (t.columns.length === 0) {
      g += `<text x="12" y="${HH + SVG_ROW_HEIGHT / 2 + 4 + SVG_NODE_PADDING_Y}" font-family="${SVG_FONT}" font-size="11" font-style="italic" fill="#94a3b8">No columns</text>`;
    } else {
      t.columns.forEach((c, i) => {
        const cy = HH + SVG_NODE_PADDING_Y + i * SVG_ROW_HEIGHT + SVG_ROW_HEIGHT / 2;
        const isPK = c.indexType === 'primary_key';
        const isFK = c.indexType === 'foreign_key';
        const isUQ = c.indexType === 'unique';

        // Index marker — SVG primitives, no font/emoji dependency
        if (isPK) {
          g += `<circle cx="14" cy="${cy}" r="4" fill="#eab308"/>`;
        } else if (isFK) {
          g += `<circle cx="14" cy="${cy}" r="4" fill="#6366f1"/>`;
        } else if (isUQ) {
          g += `<rect x="10" y="${cy - 4}" width="8" height="8" transform="rotate(45 14 ${cy})" fill="none" stroke="#10b981" stroke-width="1.5"/>`;
        } else {
          g += `<circle cx="14" cy="${cy}" r="1.5" fill="#94a3b8"/>`;
        }

        const nameColor = isPK ? '#a16207' : isFK ? '#4f46e5' : '#1e293b';
        const nameWeight = isPK ? '600' : '400';
        g += `<text x="26" y="${cy + 4}" font-family="${SVG_FONT}" font-size="11" font-weight="${nameWeight}" fill="${nameColor}">${escapeXml(c.name)}</text>`;
        g += `<text x="${W - 12}" y="${cy + 4}" text-anchor="end" font-family="${SVG_FONT}" font-size="9" fill="#64748b">${escapeXml(c.dataType)}</text>`;
      });
    }
    g += `</g>`;
    nodeParts.push(g);
  }

  // width/height = 100% + viewBox makes the SVG fill its viewport (so it
  // centers itself when the file is opened standalone in a browser); the
  // viewBox preserves the diagram's intrinsic aspect ratio. For raster
  // export we swap back to explicit pixel dims (see svgToPngBlob).
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    edgeParts.join('') +
    nodeParts.join('') +
    `</svg>`;

  return { svg, width, height };
}

async function svgToPngBlob(svg: string, width: number, height: number, scale: number): Promise<Blob> {
  // Canvas needs explicit intrinsic size to rasterize correctly — replace
  // the percentage dims with pixels before handing the SVG to <img>.
  const pixelSvg = svg.replace(
    'width="100%" height="100%"',
    `width="${width}" height="${height}"`,
  );
  const svgBlob = new Blob([pixelSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG image failed to load'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2D context unavailable');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
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
        poolName: c.indexType === 'primary_key' ? `${tableName}.${c.name.trim()}` : undefined,
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
    buildNodes(tables, onTableClick, layoutWithDagre(tables)),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<DiagramEdge>(buildEdges(tables));
  const [showAddForm, setShowAddForm] = useState(false);
  const [copied, setCopied] = useState(false);

  // Re-layout when the table SET changes (added/removed) but preserve user
  // drags otherwise. We compare the sorted id list to detect set changes.
  const tableIdsKey = tables.map((t) => t.id).sort().join('|');
  useEffect(() => {
    setNodes(buildNodes(tables, onTableClick, layoutWithDagre(tables)));
    setEdges(buildEdges(tables));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableIdsKey]);

  // Refresh edges whenever FK config changes (without re-laying out positions)
  useEffect(() => {
    setEdges(buildEdges(tables));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables]);

  function handleAutoArrange() {
    const positions = layoutWithDagre(tables);
    setNodes((nds) =>
      nds.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position })),
    );
  }

  async function handleDownload(format: 'png' | 'svg') {
    if (tables.length === 0) return;

    // Use current node positions so user drags are preserved in the export
    const positions = new Map(nodes.map((n) => [n.id, n.position]));
    const { svg, width, height } = buildExportSvg(tables, positions);

    const blob =
      format === 'svg'
        ? new Blob([svg], { type: 'image/svg+xml' })
        : await svgToPngBlob(svg, width, height, 2);

    const projectName = useProjectStore.getState().project?.name ?? 'diagram';
    const safe = projectName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safe}-${new Date().toISOString().slice(0, 10)}.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleCopyImage() {
    if (tables.length === 0) return;
    const positions = new Map(nodes.map((n) => [n.id, n.position]));
    const { svg, width, height } = buildExportSvg(tables, positions);
    try {
      // Rasterize to PNG — Word/Docs/Slack/Notion all accept image/png from
      // the clipboard. image/svg+xml support is too spotty across paste targets.
      const pngBlob = await svgToPngBlob(svg, width, height, 2);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in non-secure contexts; surface nothing rather
      // than throwing — the user will retry or use the download button.
    }
  }

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

      <div className="absolute top-3 right-3 z-10 flex gap-2">
        <button
          onClick={handleAutoArrange}
          title="Re-layout tables by FK hierarchy"
          className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors shadow"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          Auto-Arrange
        </button>
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
        <button
          onClick={() => handleDownload('png')}
          title="Download diagram as PNG"
          className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors shadow"
        >
          <Download className="w-3.5 h-3.5" />
          PNG
        </button>
        <button
          onClick={() => handleDownload('svg')}
          title="Download diagram as SVG"
          className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors shadow"
        >
          <Download className="w-3.5 h-3.5" />
          SVG
        </button>
        <button
          onClick={handleCopyImage}
          title="Copy diagram as image (paste into Word, Docs, Slack, etc.)"
          className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors shadow"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy Image'}
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
