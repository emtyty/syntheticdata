import { useEffect, useRef } from 'react';
import { Zap, ArrowLeft, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/appStore.js';
import { startGeneration, pollJobStatus, getPreview } from '../../api/client.js';

export function GeneratePanel() {
  const {
    schema, rowCount, setRowCount, seedInput, setSeedInput,
    setJob, setJobStatus, setPreviewRows, setStep, jobStatus, jobProgress, jobError, jobSeed,
  } = useAppStore();

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => () => stopPolling(), []);

  async function handleGenerate() {
    if (!schema) return;
    const seed = seedInput.trim() ? parseInt(seedInput) : undefined;
    const { jobId: id, seed: resolvedSeed } = await startGeneration(schema.id, rowCount, seed);
    setJob(id, resolvedSeed);

    pollRef.current = setInterval(async () => {
      const { status, progress, errorMessage } = await pollJobStatus(id);
      setJobStatus(status as never, progress, errorMessage);
      if (status === 'done') {
        stopPolling();
        const rows = await getPreview(id, 5);
        setPreviewRows(rows);
        setStep('preview');
      } else if (status === 'error') {
        stopPolling();
      }
    }, 500);
  }

  const isRunning = jobStatus === 'pending' || jobStatus === 'running';

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Zap className="w-10 h-10 mx-auto mb-3 text-primary" />
          <h2 className="text-xl font-bold">Generate Data</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {schema?.name} · {schema?.columns.length} columns · {schema?.rules.length} rules
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          {/* Row count */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Record Count</label>
            <div className="flex gap-2 flex-wrap">
              {[10, 100, 1000, 5000, 10000].map(n => (
                <button
                  key={n}
                  onClick={() => setRowCount(n)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    rowCount === n
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  {n.toLocaleString()}
                </button>
              ))}
              <input
                type="number"
                min={1} max={100000}
                className="w-24 bg-background border border-border rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Custom"
                value={rowCount}
                onChange={e => setRowCount(Math.min(100000, Math.max(1, Number(e.target.value))))}
              />
            </div>
          </div>

          {/* Seed */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">
              Seed <span className="text-muted-foreground/60">(blank = random, same seed = identical output)</span>
            </label>
            <input
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g. 42"
              value={seedInput}
              onChange={e => setSeedInput(e.target.value)}
            />
            {jobSeed !== null && (
              <p className="text-xs text-muted-foreground mt-1">Last seed: <span className="text-foreground font-mono">{jobSeed}</span></p>
            )}
          </div>

          {/* Progress */}
          {isRunning && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Generating {rowCount.toLocaleString()} rows...</span>
                <span>{jobProgress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${jobProgress}%` }}
                />
              </div>
            </div>
          )}

          {jobError && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 text-sm text-destructive">
              {jobError}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => setStep('schema')}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <button
              onClick={handleGenerate}
              disabled={isRunning}
              className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isRunning
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating...</>
                : <><Zap className="w-3.5 h-3.5" /> Generate</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
