/**
 * CSV inference service.
 * Parses a CSV buffer, detects column types via a cascade,
 * and returns a suggested ColumnSchema[] for the user to confirm.
 *
 * Type detection cascade (≥90% of non-empty values must pass):
 * UUID → Email → URL → Phone → ISO Date → ISO Datetime →
 * Boolean → Integer → Float → Enum (≤20 unique, ≤15% of sample) → String
 */

import Papa from 'papaparse';
import type { ColumnDataType, ColumnSchema, GeneratorConfig, InferredSchema } from '../types/index.js';

// ─── Regex helpers ────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/i;
const PHONE_RE = /^[+]?[\d\s\-().]{7,20}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const BOOL_VALUES = new Set(['true', 'false', '1', '0', 'yes', 'no']);

function passRate(values: string[], test: (v: string) => boolean): number {
  if (values.length === 0) return 0;
  return values.filter(test).length / values.length;
}

function detectType(samples: string[]): { type: ColumnDataType; config: GeneratorConfig } {
  const nonEmpty = samples.filter(v => v.trim() !== '');
  if (nonEmpty.length === 0) return { type: 'string', config: {} };

  const threshold = 0.9;

  if (passRate(nonEmpty, v => UUID_RE.test(v)) >= threshold)
    return { type: 'uuid', config: {} };

  if (passRate(nonEmpty, v => EMAIL_RE.test(v)) >= threshold)
    return { type: 'email', config: {} };

  if (passRate(nonEmpty, v => URL_RE.test(v)) >= threshold)
    return { type: 'url', config: {} };

  if (passRate(nonEmpty, v => PHONE_RE.test(v)) >= threshold)
    return { type: 'phone', config: {} };

  // Date before datetime (datetime is more specific)
  if (passRate(nonEmpty, v => ISO_DATETIME_RE.test(v)) >= threshold)
    return { type: 'datetime', config: { dateFrom: '2020-01-01', dateTo: '2025-12-31' } };

  if (passRate(nonEmpty, v => ISO_DATE_RE.test(v)) >= threshold)
    return { type: 'date', config: { dateFrom: '2020-01-01', dateTo: '2025-12-31' } };

  if (passRate(nonEmpty, v => BOOL_VALUES.has(v.toLowerCase())) >= threshold)
    return { type: 'boolean', config: {} };

  if (passRate(nonEmpty, v => Number.isInteger(Number(v)) && !isNaN(Number(v))) >= threshold) {
    const nums = nonEmpty.map(Number);
    return {
      type: 'integer',
      config: { min: Math.min(...nums), max: Math.max(...nums) },
    };
  }

  if (passRate(nonEmpty, v => !isNaN(parseFloat(v))) >= threshold) {
    const nums = nonEmpty.map(parseFloat);
    return {
      type: 'float',
      config: { min: Math.min(...nums), max: Math.max(...nums), precision: 2 },
    };
  }

  const unique = new Set(nonEmpty);
  if (unique.size <= 20 && unique.size / nonEmpty.length <= 0.15) {
    return {
      type: 'enum',
      config: { enumValues: Array.from(unique) },
    };
  }

  const maxLen = Math.max(...nonEmpty.map(v => v.length));
  const minLen = Math.min(...nonEmpty.map(v => v.length));
  return { type: 'string', config: { minLength: minLen, maxLength: Math.max(maxLen, 10) } };
}

export function inferFromCsv(buffer: Buffer): InferredSchema {
  const text = buffer.toString('utf-8');
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error('Failed to parse CSV: ' + result.errors[0]?.message);
  }

  const headers = result.meta.fields ?? [];
  const rows = result.data;
  const warnings: string[] = [];

  // Sample up to 500 rows for inference
  const sampleRows = rows.slice(0, 500);

  const columns: Omit<ColumnSchema, 'id'>[] = headers.map(header => {
    const samples = sampleRows.map(r => String(r[header] ?? ''));
    const nullCount = samples.filter(v => v === '' || v === 'null' || v === 'NULL').length;
    const nullRate = nullCount / samples.length;
    const nonNullSamples = samples.filter(v => v !== '' && v !== 'null' && v !== 'NULL');

    const { type, config } = detectType(nonNullSamples);

    const isLikelyPk = (
      header.toLowerCase() === 'id' ||
      header.toLowerCase().endsWith('_id') && new Set(samples).size === samples.length
    ) && type === 'uuid' || (
      (header.toLowerCase() === 'id' || header.toLowerCase().endsWith('_id')) &&
      type === 'integer' &&
      new Set(samples).size === samples.length
    );

    return {
      name: header,
      dataType: type,
      indexType: isLikelyPk ? 'primary_key' : 'none',
      poolName: isLikelyPk ? undefined : undefined, // set by schema route
      notNull: nullRate < 0.01,
      generatorConfig: { ...config, nullRate: parseFloat(nullRate.toFixed(2)) },
      sampleValues: nonNullSamples.slice(0, 5),
    };
  });

  if (rows.length > 500) {
    warnings.push(`Only first 500 rows used for type inference (${rows.length} total).`);
  }

  return { columns, rowCount: rows.length, warnings };
}
