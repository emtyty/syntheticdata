import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { DatasetSchema } from '../../types/index.js';

interface Props {
  tables: DatasetSchema[];
  activeTableId: string | null;
  onSelectTable: (id: string) => void;
  onAddTable: () => void;
  onDeleteTable: (id: string) => void;
}

export function TableSidebar({
  tables,
  activeTableId,
  onSelectTable,
  onAddTable,
  onDeleteTable,
}: Props) {
  return (
    <div className="w-56 shrink-0 border-r border-border bg-card/30 flex flex-col">
      <div className="px-3 py-3 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Tables
        </span>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {tables.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6 px-3">
            No tables yet. Add one below.
          </p>
        )}

        {tables.map((table) => {
          const isActive = table.id === activeTableId;
          return (
            <div
              key={table.id}
              onClick={() => onSelectTable(table.id)}
              className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary border-r-2 border-primary'
                  : 'hover:bg-muted/50 text-foreground'
              }`}
            >
              {/* Drag handle (UX hint only) */}
              <GripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0 cursor-grab" />

              {/* Name */}
              <span className="flex-1 text-sm font-mono truncate min-w-0">
                {table.name}
              </span>

              {/* Column count badge */}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                  isActive
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {table.columns.length}
              </span>

              {/* Delete button (hover reveal) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTable(table.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0 p-0.5 rounded"
                title="Delete table"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add table button */}
      <div className="p-3 border-t border-border">
        <button
          onClick={onAddTable}
          className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-primary/50 rounded-lg py-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Table
        </button>
      </div>
    </div>
  );
}
