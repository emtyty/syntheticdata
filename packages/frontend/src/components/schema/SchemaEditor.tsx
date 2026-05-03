import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, ChevronRight, Settings2, ArrowRight, SlidersHorizontal, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/appStore.js';
import { useProjectStore } from '../../store/projectStore.js';
import type { ColumnSchema, DatasetSchema, IndexType } from '../../types/index.js';
import { GeneratorPicker, getFakerMappingLabel, LOCALE_FLAG } from './GeneratorPicker.js';
import { ConditionBuilder } from './ConditionBuilder.js';
import { FkConfigModal } from './FkConfigModal.js';
import { saveSchema, updateSchema, sampleColumnValue } from '../../api/client.js';

// ─── Resizable columns ─────────────────────────────────────────────────────────

const DEFAULT_WIDTHS = {
  name:    220,
  generator: 240,
  index:    90,
  pool:    180,
  notNull:  72,
  nullPct:  80,
  sample:  420,
} as const;

type ColKey = keyof typeof DEFAULT_WIDTHS;

function useColumnWidths() {
  const [widths, setWidths] = useState<Record<ColKey, number>>({ ...DEFAULT_WIDTHS });
  function startResize(key: ColKey, startX: number) {
    const startWidth = widths[key];
    function onMove(e: MouseEvent) {
      const next = Math.max(60, Math.min(600, startWidth + (e.clientX - startX)));
      setWidths(w => ({ ...w, [key]: next }));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    }
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  return { widths, startResize };
}

interface ResizableThProps {
  colKey: ColKey;
  width: number;
  startResize: (key: ColKey, startX: number) => void;
  children: React.ReactNode;
}

function ResizableTh({ colKey, width, startResize, children }: ResizableThProps) {
  return (
    <th
      style={{ width, minWidth: width, maxWidth: width }}
      className="pb-2 pr-4 font-medium relative"
    >
      {children}
      <span
        onMouseDown={e => { e.preventDefault(); startResize(colKey, e.clientX); }}
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/40 transition-colors"
      />
    </th>
  );
}

export function SchemaEditor() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { schema, schemaServerSaved, updateColumn, addColumn, removeColumn, setSchema, setStep, addRule, removeRule } = useAppStore();
  const { project, tableRowCounts } = useProjectStore();
  const { widths, startResize } = useColumnWidths();
  // All tables from the project (for cross-table FK pool selection)
  const allProjectTables = project?.tables ?? [];

  const [pickerColId, setPickerColId] = useState<string | null>(null);
  const [fkConfigColId, setFkConfigColId] = useState<string | null>(null);
  const [showConditionBuilder, setShowConditionBuilder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!schema) return null;

  const pickerCol = pickerColId ? schema.columns.find(c => c.id === pickerColId) : null;
  const fkConfigCol = fkConfigColId ? schema.columns.find(c => c.id === fkConfigColId) : null;

  // True when SchemaEditor is embedded inside the project editor (the table
  // lives in the project store, not in the standalone schemas store).
  const isProjectTable = !!project?.tables.some(t => t.id === schema?.id);

  async function handleNext() {
    if (!schema) return;
    setSaving(true);
    setError(null);
    try {
      if (isProjectTable && projectId) {
        // In project context: the table is already synced to the project store
        // via the useEffect in ProjectEditor. Just navigate to the Generate tab.
        navigate(`/projects/${projectId}/generate`);
      } else {
        const payload = { name: schema.name, columns: schema.columns, rules: schema.rules, sourceType: schema.sourceType };
        const saved = schemaServerSaved
          ? await updateSchema(schema.id, payload)
          : await saveSchema(payload);
        setSchema(saved, true);
        setStep('generate');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Main column table */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-outline-variant bg-surface-container/50">
          <div className="flex items-center gap-3">
            <Settings2 className="w-4 h-4 text-on-surface-variant" />
            <input
              className="bg-transparent text-sm font-semibold focus:outline-none focus:border-b focus:border-primary"
              value={schema.name}
              onChange={e => setSchema({ ...schema, name: e.target.value })}
            />
            <span className="text-xs text-on-surface-variant border border-outline-variant rounded px-1.5 py-0.5">
              {schema.sourceType}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isProjectTable && (
              <button
                onClick={() => setStep('import')}
                className="text-sm text-on-surface-variant hover:text-on-surface px-3 py-1.5 rounded-md hover:bg-surface-container-high transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={saving || schema.columns.length === 0}
              className="flex items-center gap-2 bg-primary text-on-primary-fixed text-sm px-4 py-1.5 rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : isProjectTable ? 'Go to Generate' : 'Next: Generate'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-3 bg-error/10 border border-error/30 rounded-md px-4 py-2 text-sm text-error">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto p-6">
          <table className="text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="text-left text-xs text-on-surface-variant border-b border-outline-variant">
                <ResizableTh colKey="name"      width={widths.name}      startResize={startResize}>Column Name</ResizableTh>
                <ResizableTh colKey="generator" width={widths.generator} startResize={startResize}>Generator</ResizableTh>
                <ResizableTh colKey="index"     width={widths.index}     startResize={startResize}>Index</ResizableTh>
                <ResizableTh colKey="pool"      width={widths.pool}      startResize={startResize}>Pool Ref</ResizableTh>
                <ResizableTh colKey="notNull"   width={widths.notNull}   startResize={startResize}>Not Null</ResizableTh>
                <ResizableTh colKey="nullPct"   width={widths.nullPct}   startResize={startResize}>Null %</ResizableTh>
                <ResizableTh colKey="sample"    width={widths.sample}    startResize={startResize}>Sample Values</ResizableTh>
                <th className="pb-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {schema.columns.map(col => (
                <ColumnRow
                  key={col.id}
                  col={col}
                  widths={widths}
                  thisTable={schema}
                  allProjectTables={allProjectTables}
                  onUpdate={updateColumn}
                  onPickGenerator={() => setPickerColId(col.id)}
                  onOpenFkConfig={() => setFkConfigColId(col.id)}
                  onRemove={() => removeColumn(col.id)}
                />
              ))}
            </tbody>
          </table>

          {schema.columns.length === 0 && (
            <div className="text-center py-16 text-on-surface-variant text-sm">
              No columns yet. Add one below.
            </div>
          )}

          <button
            onClick={addColumn}
            className="mt-4 flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface border border-dashed border-outline-variant hover:border-primary/50 rounded-md px-4 py-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Column
          </button>
        </div>
      </div>

      {/* Rules sidebar */}
      <div className="w-64 border-l border-outline-variant bg-surface-container/30 flex flex-col">
        <div className="px-4 py-3 border-b border-outline-variant flex items-center justify-between">
          <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Conditions Applied</span>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2">
          {schema.rules.length === 0 && (
            <p className="text-xs text-on-surface-variant text-center py-6">No rules yet</p>
          )}
          {schema.rules.map(rule => (
            <div key={rule.id} className="bg-surface-container border border-outline-variant rounded-md p-2.5 text-xs">
              <div className="flex items-start justify-between gap-1">
                <div>
                  <span className="text-green-400 font-medium">{rule.name ?? 'Rule'}</span>
                  <div className="text-on-surface-variant mt-1">
                    {rule.conditions.map((c, i) => (
                      <span key={i}>
                        {i > 0 && <span className="text-primary"> AND </span>}
                        <span className="text-on-surface">{c.column}</span>{' '}
                        <span className="text-on-surface-variant">{c.op}</span>{' '}
                        {c.value !== undefined && <span className="text-yellow-300">"{String(c.value)}"</span>}
                      </span>
                    ))}
                  </div>
                  <div className="text-on-surface-variant mt-1">
                    → <span className="text-on-surface">{rule.actionColumn}</span>{' '}
                    <span className="text-on-surface-variant">{rule.action}</span>
                  </div>
                </div>
                <button onClick={() => removeRule(rule.id)} className="text-on-surface-variant hover:text-error">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-outline-variant">
          <button
            onClick={() => setShowConditionBuilder(true)}
            className="w-full flex items-center justify-center gap-2 bg-surface-container-high hover:bg-surface-bright text-sm py-2 rounded-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Rule
          </button>
        </div>
      </div>

      {/* Generator picker modal */}
      {pickerCol && (
        <GeneratorPicker
          current={pickerCol.dataType}
          currentFakerFn={pickerCol.generatorConfig.fakerFn}
          currentLocale={pickerCol.generatorConfig.locale}
          currentPersonaGroup={pickerCol.generatorConfig.personaGroup}
          columnName={pickerCol.name}
          onSelect={(type, config) => {
            updateColumn({
              ...pickerCol,
              dataType: type,
              generatorConfig: { ...config, nullRate: pickerCol.generatorConfig.nullRate ?? 0 },
            });
            setPickerColId(null);
          }}
          onClose={() => setPickerColId(null)}
        />
      )}

      {/* FK config modal */}
      {fkConfigCol && (
        <FkConfigModal
          col={fkConfigCol}
          allTables={allProjectTables.length > 0 ? allProjectTables : [schema]}
          rowCounts={tableRowCounts}
          onSave={updated => { updateColumn(updated); setFkConfigColId(null); }}
          onClose={() => setFkConfigColId(null)}
        />
      )}

      {/* Condition builder modal */}
      {showConditionBuilder && (
        <ConditionBuilder
          columns={schema.columns}
          onSave={rule => {
            addRule(rule);
            setShowConditionBuilder(false);
          }}
          onClose={() => setShowConditionBuilder(false)}
        />
      )}
    </div>
  );
}

// ─── Column row ────────────────────────────────────────────────────────────────

interface RowProps {
  col: ColumnSchema;
  widths: Record<ColKey, number>;
  thisTable: DatasetSchema;
  allProjectTables: DatasetSchema[];
  onUpdate: (col: ColumnSchema) => void;
  onPickGenerator: () => void;
  onOpenFkConfig: () => void;
  onRemove: () => void;
}

// Collects all PK columns across all tables as { poolRef: "Table.col", label: "Table.col" }
function buildPoolOptions(allTables: DatasetSchema[], currentTableId: string) {
  const options: { value: string; label: string }[] = [];
  for (const table of allTables) {
    for (const c of table.columns) {
      if (c.indexType === 'primary_key') {
        const ref = `${table.name}.${c.name}`;
        const isSame = table.id === currentTableId;
        options.push({ value: ref, label: isSame ? `${ref} (this table)` : ref });
      }
    }
  }
  return options;
}

function ColumnRow({ col, widths, thisTable, allProjectTables, onUpdate, onPickGenerator, onOpenFkConfig, onRemove }: RowProps) {
  // All PK pools available across the project
  const poolOptions = buildPoolOptions(
    allProjectTables.length > 0 ? allProjectTables : [thisTable],
    thisTable.id,
  );

  // ── Live sample value: re-fetch when the column config changes (debounced) ──
  const [liveSample, setLiveSample] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable cache key — only re-sample when fields that affect generation change
  const sampleKey = JSON.stringify({
    dataType: col.dataType,
    indexType: col.indexType,
    cfg: col.generatorConfig,
  });

  function fetchSample(seed?: number) {
    setRefreshing(true);
    sampleColumnValue(col, seed)
      .then(v => setLiveSample(v === null ? '' : String(v)))
      .catch(() => setLiveSample(null))
      .finally(() => setRefreshing(false));
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSample(), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleKey]);

  return (
    <tr className="border-b border-outline-variant/50 hover:bg-surface-container/50 group">
      {/* Name */}
      <td className="py-2 pr-4" style={{ width: widths.name, maxWidth: widths.name }}>
        <input
          className="bg-transparent w-full focus:outline-none focus:border-b focus:border-primary text-sm font-mono"
          value={col.name}
          onChange={e => onUpdate({ ...col, name: e.target.value })}
        />
      </td>

      {/* Generator (resizable column → label expands to fill) */}
      <td className="py-2 pr-4" style={{ width: widths.generator, maxWidth: widths.generator }}>
        <button
          onClick={onPickGenerator}
          className="w-full flex flex-col items-start gap-0.5 text-xs bg-surface-container-high hover:bg-surface-bright border border-outline-variant rounded px-2 py-1.5 transition-colors text-left"
        >
          <div className="flex items-center gap-1 w-full">
            <span className="font-mono text-primary">{col.dataType}</span>
            <ChevronRight className="w-3 h-3 text-on-surface-variant" />
            {col.generatorConfig.locale && col.generatorConfig.locale !== 'en_US' && (
              <span className="text-[11px] ml-auto" title={col.generatorConfig.locale}>
                {LOCALE_FLAG(col.generatorConfig.locale)}
              </span>
            )}
          </div>
          {col.generatorConfig.fakerFn && (
            <span
              className="text-[10px] text-on-surface-variant leading-tight"
              style={{ maxWidth: widths.generator - 24, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={col.generatorConfig.fakerFn}
            >
              {getFakerMappingLabel(col.generatorConfig.fakerFn) ?? col.generatorConfig.fakerFn}
              {col.generatorConfig.personaGroup && ` · 👤 ${col.generatorConfig.personaGroup}`}
            </span>
          )}
        </button>
      </td>

      {/* Index */}
      <td className="py-2 pr-4" style={{ width: widths.index, maxWidth: widths.index }}>
        <select
          className="bg-transparent text-xs border border-outline-variant rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
          value={col.indexType}
          onChange={e => {
            const idx = e.target.value as IndexType;
            const defaultPool = poolOptions.find(p => !p.label.includes('this table'))?.value
              ?? poolOptions[0]?.value
              ?? '';
            onUpdate({
              ...col,
              indexType: idx,
              // PK: register as "TableName.colName" pool
              poolName: idx === 'primary_key' ? `${thisTable.name}.${col.name}` : undefined,
              generatorConfig: idx === 'foreign_key'
                ? { ...col.generatorConfig, poolRef: defaultPool }
                : { ...col.generatorConfig, poolRef: undefined },
            });
          }}
        >
          <option value="none">—</option>
          <option value="primary_key">PK</option>
          <option value="unique">UQ</option>
          <option value="foreign_key">FK</option>
        </select>
      </td>

      {/* Pool ref (FK: cross-table dropdown + gear; PK: show pool name) */}
      <td className="py-2 pr-4" style={{ width: widths.pool, maxWidth: widths.pool }}>
        {col.indexType === 'foreign_key' ? (
          <div className="flex items-center gap-1">
            <select
              className="bg-transparent text-xs border border-outline-variant rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary max-w-[130px]"
              value={col.generatorConfig.poolRef ?? ''}
              onChange={e => onUpdate({ ...col, generatorConfig: { ...col.generatorConfig, poolRef: e.target.value } })}
            >
              <option value="">— select pool —</option>
              {poolOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={onOpenFkConfig}
              title="FK distribution config"
              className={`p-1 rounded hover:bg-surface-container-high transition-colors ${
                col.generatorConfig.fkDistribution && col.generatorConfig.fkDistribution !== 'uniform'
                  ? 'text-primary'
                  : 'text-on-surface-variant'
              }`}
            >
              <SlidersHorizontal className="w-3 h-3" />
            </button>
          </div>
        ) : col.indexType === 'primary_key' && col.poolName ? (
          <span className="text-xs font-mono text-yellow-500/80">{col.poolName}</span>
        ) : (
          <span className="text-on-surface-variant text-xs">—</span>
        )}
      </td>

      {/* Not Null */}
      <td className="py-2 pr-4" style={{ width: widths.notNull, maxWidth: widths.notNull }}>
        <input
          type="checkbox"
          checked={col.notNull}
          onChange={e => onUpdate({ ...col, notNull: e.target.checked })}
          className="accent-primary"
        />
      </td>

      {/* Null % */}
      <td className="py-2 pr-4" style={{ width: widths.nullPct, maxWidth: widths.nullPct }}>
        <input
          type="number"
          min={0} max={100} step={5}
          className="bg-transparent text-xs border border-outline-variant rounded px-1.5 py-1 w-16 focus:outline-none focus:ring-1 focus:ring-primary"
          value={Math.round((col.generatorConfig.nullRate ?? 0) * 100)}
          disabled={col.notNull}
          onChange={e => onUpdate({ ...col, generatorConfig: { ...col.generatorConfig, nullRate: Number(e.target.value) / 100 } })}
        />
      </td>

      {/* Sample values — live preview from backend; click 🔄 to re-roll */}
      <td className="py-2 pr-4" style={{ width: widths.sample, maxWidth: widths.sample }}>
        <div className="flex items-center gap-1.5 group/sample">
          {liveSample !== null ? (
            <span
              className="text-xs bg-surface-container-high border border-outline-variant rounded px-1.5 py-0.5 font-mono text-on-surface-variant truncate flex-1"
              title={liveSample}
              style={{ maxWidth: widths.sample - 32 }}
            >
              {liveSample === '' ? <span className="italic">(empty)</span> : liveSample}
            </span>
          ) : (
            <span className="text-xs text-on-surface-variant/50 italic">—</span>
          )}
          <button
            onClick={() => fetchSample(Date.now())}
            disabled={refreshing}
            title="Re-roll sample"
            className="opacity-0 group-hover/sample:opacity-100 text-on-surface-variant hover:text-primary transition-all disabled:opacity-30"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </td>

      {/* Delete */}
      <td className="py-2">
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}
