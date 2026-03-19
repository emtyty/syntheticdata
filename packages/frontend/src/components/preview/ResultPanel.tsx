import { useState, useEffect } from 'react';
import { Download, Eye, Code, ArrowLeft, RefreshCw, Zap } from 'lucide-react';
import { useAppStore } from '../../store/appStore.js';
import { getPreview, exportUrl, startGeneration, pollJobStatus } from '../../api/client.js';
import type { GeneratedRow } from '../../types/index.js';
import { cn } from '../../lib/utils.js';

type ViewMode = 'table' | 'json';
type ExportFormat = 'csv' | 'json' | 'sql';

export function ResultPanel() {
  const {
    schema, jobId, jobSeed, rowCount, previewRows, setPreviewRows,
    setJob, setJobStatus, setStep,
  } = useAppStore();

  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [exportCount, setExportCount] = useState(rowCount);
  const [includeHeader, setIncludeHeader] = useState(true);
  const [prettyPrint, setPrettyPrint] = useState(false);
  const [previewAll, setPreviewAll] = useState<GeneratedRow[]>(previewRows);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (jobId && previewRows.length === 0) {
      setLoadingPreview(true);
      getPreview(jobId, 20).then(rows => {
        setPreviewAll(rows);
        setPreviewRows(rows);
      }).finally(() => setLoadingPreview(false));
    } else {
      setPreviewAll(previewRows);
    }
  }, [jobId]);

  const headers = previewAll.length > 0 ? Object.keys(previewAll[0]) : [];

  function handleDownload() {
    if (!jobId) return;
    const url = exportUrl(jobId, exportFormat, {
      table: schema?.name ?? 'data',
      pretty: prettyPrint,
      header: includeHeader,
    });
    const a = document.createElement('a');
    a.href = url;
    a.download = `synthetic_${schema?.name ?? 'data'}.${exportFormat}`;
    a.click();
  }

  async function handleRegenerate() {
    if (!schema) return;
    const { jobId: id, seed } = await startGeneration(schema.id, exportCount, undefined);
    setJob(id, seed);
    const poll = setInterval(async () => {
      const { status, progress, errorMessage } = await pollJobStatus(id);
      setJobStatus(status as never, progress, errorMessage);
      if (status === 'done') {
        clearInterval(poll);
        const rows = await getPreview(id, 20);
        setPreviewAll(rows);
        setPreviewRows(rows);
      }
    }, 500);
  }

  const conditionsApplied = [
    ...(schema?.columns.filter(c => c.indexType === 'primary_key').map(c => `Unique IDs for ${c.name}`) ?? []),
    ...(schema?.columns.filter(c => c.notNull).map(c => `${c.name} not null`) ?? []),
    ...(schema?.rules.map(r => r.name ?? 'Custom rule') ?? []),
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <div className="w-56 border-r border-border bg-card/30 flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Template Summary</p>
        </div>
        <div className="p-3 space-y-1 text-sm border-b border-border">
          <button
            onClick={() => setStep('schema')}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs"
          >
            Schema Definition
          </button>
          <button className="w-full text-left px-2 py-1.5 rounded bg-muted text-foreground text-xs">
            Active Filters ({schema?.rules.length ?? 0})
          </button>
          <button className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs">
            Custom Logic
          </button>
        </div>

        <div className="p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Conditions Applied</p>
          <div className="space-y-1.5">
            {conditionsApplied.slice(0, 8).map((c, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>{c}</span>
              </div>
            ))}
            {conditionsApplied.length === 0 && (
              <p className="text-xs text-muted-foreground/60">No constraints</p>
            )}
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50">
          <div className="flex items-center gap-3">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Preview & Export</span>
            <span className="text-xs text-muted-foreground">
              Seed: <span className="font-mono text-foreground">{jobSeed}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep('generate')}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Preview table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">
                Data Preview <span className="text-muted-foreground font-normal">(First {previewAll.length} rows)</span>
              </h3>
              <div className="flex gap-1 bg-muted rounded-md p-1">
                <button
                  onClick={() => setViewMode('table')}
                  className={cn('flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors', viewMode === 'table' ? 'bg-card text-foreground' : 'text-muted-foreground')}
                >
                  <Eye className="w-3 h-3" /> Table
                </button>
                <button
                  onClick={() => setViewMode('json')}
                  className={cn('flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors', viewMode === 'json' ? 'bg-card text-foreground' : 'text-muted-foreground')}
                >
                  <Code className="w-3 h-3" /> JSON
                </button>
              </div>
            </div>

            {loadingPreview ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading preview...
              </div>
            ) : viewMode === 'table' ? (
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted border-b border-border">
                      {headers.map(h => (
                        <th key={h} className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewAll.map((row, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-card/50">
                        {headers.map(h => {
                          const v = row[h];
                          return (
                            <td key={h} className="px-3 py-2 font-mono max-w-xs truncate">
                              {v === null ? (
                                <span className="text-muted-foreground italic">null</span>
                              ) : typeof v === 'boolean' ? (
                                <span className={v ? 'text-green-400' : 'text-red-400'}>{String(v)}</span>
                              ) : (
                                <span>{String(v)}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <pre className="bg-background border border-border rounded-lg p-4 text-xs overflow-auto max-h-80 font-mono text-muted-foreground">
                {JSON.stringify(previewAll, null, 2)}
              </pre>
            )}
          </div>

          {/* Export config */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4">Export Configuration</h3>
            <div className="flex flex-wrap gap-6">
              {/* Format */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">File Format</p>
                <div className="flex gap-2">
                  {(['csv', 'json', 'sql'] as ExportFormat[]).map(f => (
                    <button
                      key={f}
                      onClick={() => setExportFormat(f)}
                      className={cn(
                        'px-4 py-2 rounded-lg border text-xs font-semibold uppercase transition-colors',
                        exportFormat === f
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50',
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Record count */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Record Count</p>
                <select
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  value={exportCount}
                  onChange={e => setExportCount(Number(e.target.value))}
                >
                  {[10, 100, 1000, 5000, 10000, 50000, 100000].map(n => (
                    <option key={n} value={n}>{n.toLocaleString()} Records</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Options */}
            <div className="flex gap-4 mt-4 text-xs text-muted-foreground">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeHeader} onChange={e => setIncludeHeader(e.target.checked)} className="accent-primary" />
                Include header row
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={prettyPrint} onChange={e => setPrettyPrint(e.target.checked)} className="accent-primary" />
                Pretty print output
              </label>
            </div>

            {/* Download */}
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleRegenerate}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
              >
                <Zap className="w-3.5 h-3.5" /> Regenerate ({exportCount.toLocaleString()})
              </button>
              <button
                onClick={handleDownload}
                disabled={!jobId}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download Data
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
