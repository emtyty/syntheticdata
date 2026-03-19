import { useEffect, useRef, useState } from 'react';
import { Zap, RefreshCw, ArrowRight } from 'lucide-react';
import { startProjectGeneration, pollProjectJobStatus, getProjectPreview } from '../../api/client.js';
import { useProjectStore } from '../../store/projectStore.js';

interface TableConfig {
  tableId: string;
  rowCount: number;
}

export function MultiTableGenerate() {
  const { project, jobResults, setJobResult, setActiveTab } = useProjectStore();
  const tables = project?.tables ?? [];

  const [tableConfigs, setTableConfigs] = useState<TableConfig[]>([]);
  const [seedInput, setSeedInput] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Init configs when tables change
  useEffect(() => {
    setTableConfigs(
      tables.map((t) => ({
        tableId: t.id,
        rowCount: 100,
      })),
    );
  }, [tables.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => () => stopPolling(), []);

  function setRowCount(tableId: string, value: number) {
    setTableConfigs((prev) =>
      prev.map((c) => (c.tableId === tableId ? { ...c, rowCount: value } : c)),
    );
  }

  async function handleGenerate() {
    if (!project) return;
    setRunning(true);
    setProgress(0);
    setError(null);

    try {
      const seed = seedInput.trim() ? parseInt(seedInput, 10) : undefined;
      const { jobId: newJobId, seed: resolvedSeed } = await startProjectGeneration(
        project.id,
        tableConfigs,
        seed,
      );

      pollRef.current = setInterval(async () => {
        try {
          const { status, progress: prog, errorMessage } = await pollProjectJobStatus(newJobId);
          setProgress(prog);

          if (status === 'done') {
            stopPolling();
            const preview = await getProjectPreview(newJobId, 5);
            setJobResult(newJobId, resolvedSeed, preview);
            setRunning(false);
          } else if (status === 'error') {
            stopPolling();
            setError(errorMessage ?? 'Generation failed');
            setRunning(false);
          }
        } catch (e) {
          stopPolling();
          setError((e as Error).message);
          setRunning(false);
        }
      }, 600);
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
    }
  }

  if (tables.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Add tables to your project before generating data.
      </div>
    );
  }

  const isDone = !!jobResults;

  return (
    <div className="flex flex-col items-center p-8 max-w-2xl mx-auto w-full">
      <div className="mb-6 text-center">
        <Zap className="w-10 h-10 mx-auto mb-3 text-primary" />
        <h2 className="text-xl font-bold">Generate Data</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Configure row counts per table and click Generate
        </p>
      </div>

      <div className="w-full bg-card border border-border rounded-xl p-6 space-y-5">
        {/* Table row count inputs */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Row Counts
          </label>
          <div className="space-y-2">
            {tables.map((table) => {
              const config = tableConfigs.find((c) => c.tableId === table.id);
              const rowCount = config?.rowCount ?? 100;
              return (
                <div key={table.id} className="flex items-center gap-3">
                  <span className="text-sm font-mono flex-1 truncate">{table.name}</span>
                  <span className="text-xs text-muted-foreground">{table.columns.length} cols</span>
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    className="w-24 bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary text-right"
                    value={rowCount}
                    disabled={running}
                    onChange={(e) =>
                      setRowCount(
                        table.id,
                        Math.min(100000, Math.max(1, Number(e.target.value))),
                      )
                    }
                  />
                  <span className="text-xs text-muted-foreground w-8">rows</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Seed */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">
            Seed{' '}
            <span className="text-muted-foreground/60">(blank = random)</span>
          </label>
          <input
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. 42"
            value={seedInput}
            disabled={running}
            onChange={(e) => setSeedInput(e.target.value)}
          />
        </div>

        {/* Progress */}
        {running && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Generating...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Done summary */}
        {isDone && jobResults && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-green-400 mb-2">Generation complete!</p>
            {Object.entries(jobResults).map(([tId, rows]) => {
              const tbl = tables.find((t) => t.id === tId);
              return (
                <div key={tId} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-foreground">{tbl?.name ?? tId}</span>
                  <span className="text-muted-foreground">{rows.length} rows</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={running}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {running ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                Generate All
              </>
            )}
          </button>

          {isDone && (
            <button
              onClick={() => setActiveTab('export')}
              className="flex items-center gap-2 border border-border px-4 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
            >
              Go to Export
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Seed info */}
        {useProjectStore.getState().jobSeed !== null && (
          <p className="text-xs text-muted-foreground">
            Last seed:{' '}
            <span className="font-mono text-foreground">
              {useProjectStore.getState().jobSeed}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
