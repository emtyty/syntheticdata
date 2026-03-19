import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Table, Plus } from 'lucide-react';
import { nanoid } from 'nanoid';
import { cn } from '../../lib/utils.js';
import { inferFromCsv, inferFromSql } from '../../api/client.js';
import { useAppStore } from '../../store/appStore.js';
import type { ColumnSchema, DatasetSchema } from '../../types/index.js';

type Tab = 'csv' | 'sql' | 'manual';

export function ImportPanel() {
  const [tab, setTab] = useState<Tab>('csv');
  const [ddl, setDdl] = useState('');
  const [schemaName, setSchemaName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setSchema, setStep } = useAppStore();

  function buildSchema(
    name: string,
    rawCols: Omit<ColumnSchema, 'id'>[],
    sourceType: DatasetSchema['sourceType'],
  ): DatasetSchema {
    const now = new Date().toISOString();
    return {
      id: nanoid(),
      name: name || 'Untitled Schema',
      columns: rawCols.map(c => ({ ...c, id: nanoid() })),
      rules: [],
      sourceType,
      createdAt: now,
      updatedAt: now,
    };
  }

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const result = await inferFromCsv(file);
      const schema = buildSchema(
        schemaName || file.name.replace(/\.csv$/i, ''),
        result.columns,
        'upload',
      );
      setSchema(schema, false);
      setStep('schema');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [schemaName, setSchema, setStep]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt'] },
    maxFiles: 1,
    disabled: loading,
  });

  async function handleSqlImport() {
    if (!ddl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await inferFromSql(ddl);
      const schema = buildSchema(
        schemaName || result.tableName,
        result.columns,
        'sql',
      );
      setSchema(schema, false);
      setStep('schema');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleManual() {
    const schema = buildSchema(schemaName || 'New Schema', [], 'manual');
    setSchema(schema, false);
    setStep('schema');
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'csv', label: 'Upload CSV', icon: <Upload className="w-4 h-4" /> },
    { id: 'sql', label: 'Paste SQL', icon: <FileText className="w-4 h-4" /> },
    { id: 'manual', label: 'Start Blank', icon: <Plus className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-16">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Table className="w-7 h-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Synthetic Data Studio</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Schema-first synthetic data generation. No LLM, no API key, works offline.
          </p>
        </div>

        {/* Schema name */}
        <div className="mb-4">
          <input
            className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Schema name (optional)"
            value={schemaName}
            onChange={e => setSchemaName(e.target.value)}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-muted rounded-lg p-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors',
                tab === t.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-card border border-border rounded-lg p-6">
          {tab === 'csv' && (
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors',
                isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
                loading && 'opacity-50 pointer-events-none',
              )}
            >
              <input {...getInputProps()} />
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              {isDragActive ? (
                <p className="text-primary font-medium">Drop CSV here</p>
              ) : (
                <>
                  <p className="font-medium mb-1">Drag & drop a CSV file</p>
                  <p className="text-muted-foreground text-sm">or click to browse</p>
                  <p className="text-muted-foreground text-xs mt-3">
                    Column types are auto-detected from your data
                  </p>
                </>
              )}
              {loading && <p className="text-primary text-sm mt-3">Inferring schema...</p>}
            </div>
          )}

          {tab === 'sql' && (
            <div className="space-y-4">
              <textarea
                className="w-full h-52 bg-background border border-border rounded-md px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                placeholder={`CREATE TABLE orders (\n  id UUID PRIMARY KEY,\n  user_id UUID REFERENCES users(id),\n  status VARCHAR(20) NOT NULL,\n  amount DECIMAL(10,2),\n  created_at TIMESTAMP\n);`}
                value={ddl}
                onChange={e => setDdl(e.target.value)}
              />
              <button
                onClick={handleSqlImport}
                disabled={!ddl.trim() || loading}
                className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Parsing...' : 'Import SQL Schema'}
              </button>
            </div>
          )}

          {tab === 'manual' && (
            <div className="text-center py-8">
              <Plus className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium mb-1">Start with a blank schema</p>
              <p className="text-muted-foreground text-sm mb-6">
                Add columns manually in the schema editor
              </p>
              <button
                onClick={handleManual}
                className="bg-primary text-primary-foreground rounded-md py-2 px-6 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Create Blank Schema
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 bg-destructive/10 border border-destructive/30 rounded-md px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
