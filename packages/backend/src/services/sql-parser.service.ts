/**
 * SQL DDL parser service.
 * Primary: node-sql-parser (after type-name normalisation).
 * Fallback: pure-regex parser that accepts any data type name.
 */

import NodeSqlParser from 'node-sql-parser';
const { Parser } = NodeSqlParser;
import type { ColumnDataType, ColumnSchema, GeneratorConfig, IndexType } from '../types/index.js';
import { applyRealisticDefaults } from './realistic-defaults.service.js';

const parser = new Parser();

// ─── Type mapping ─────────────────────────────────────────────────────────────

function mapSqlType(sqlType: string): ColumnDataType {
  const t = sqlType.toLowerCase().replace(/\(.*\)/, '').trim();
  if (['uuid', 'uniqueidentifier', 'guid'].includes(t)) return 'uuid';
  if (['varchar', 'char', 'text', 'nvarchar', 'nchar', 'ntext',
       'tinytext', 'mediumtext', 'longtext', 'string', 'clob', 'nclob'].includes(t)) return 'string';
  if (['int', 'integer', 'bigint', 'smallint', 'tinyint', 'mediumint',
       'serial', 'bigserial', 'int2', 'int4', 'int8'].includes(t)) return 'integer';
  if (['float', 'double', 'real', 'decimal', 'numeric',
       'money', 'smallmoney', 'float4', 'float8'].includes(t)) return 'float';
  if (['bool', 'boolean', 'bit'].includes(t)) return 'boolean';
  if (t === 'date') return 'date';
  if (['datetime', 'timestamp', 'timestamptz', 'datetime2',
       'datetimeoffset', 'time', 'timetz'].includes(t)) return 'datetime';
  return 'string';
}

function defaultConfig(type: ColumnDataType): GeneratorConfig {
  switch (type) {
    case 'integer':  return { min: 1, max: 9999 };
    case 'float':    return { min: 0, max: 9999, precision: 2 };
    case 'date':     return { dateFrom: '2020-01-01', dateTo: '2025-12-31' };
    case 'datetime': return { dateFrom: '2020-01-01', dateTo: '2025-12-31' };
    case 'string':   return { minLength: 5, maxLength: 50 };
    default:         return {};
  }
}

// ─── node-sql-parser path ─────────────────────────────────────────────────────

// Normalise vendor-specific type names the parser doesn't know
function normalizeDdl(ddl: string): string {
  return ddl
    .replace(/\bUNIQUEIDENTIFIER\b/gi, 'UUID')
    .replace(/\bGUID\b/gi, 'UUID')
    .replace(/\bNVARCHAR\b/gi, 'VARCHAR')
    .replace(/\bNCHAR\b/gi, 'CHAR')
    .replace(/\bDATETIME2\b/gi, 'DATETIME')
    .replace(/\bDATETIMEOFFSET\b/gi, 'DATETIME')
    .replace(/\bSMALLMONEY\b/gi, 'DECIMAL')
    .replace(/\bMONEY\b/gi, 'DECIMAL')
    .replace(/\bNUMBER\b/gi, 'NUMERIC')
    .replace(/\bBYTEA\b/gi, 'VARCHAR')
    .replace(/\bCITEXT\b/gi, 'TEXT')
    .replace(/\bXML\b/gi, 'TEXT')
    .replace(/\bIMAGE\b/gi, 'TEXT');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractColumnsFromAst(ast: any): Omit<ColumnSchema, 'id'>[] {
  const columnDefs = ast?.create_definitions ?? [];
  const pkColumns  = new Set<string>();
  const fkMap      = new Map<string, string>();
  const uniqueCols = new Set<string>();

  for (const def of columnDefs) {
    if (def.resource !== 'constraint') continue;
    const ct = (def.constraint_type ?? '').toLowerCase();
    const srcCols: string[] = [
      ...(def.definition     ?? []).map((c: any) => c.column).filter(Boolean),
      ...(def.index_columns  ?? []).map((c: any) => c.column ?? c.expr?.column).filter(Boolean),
    ];
    if (ct === 'primary key') {
      srcCols.forEach(c => pkColumns.add(c));
    } else if (ct === 'foreign key') {
      const srcCol = srcCols[0];
      const refTableArr = def.reference_definition?.table;
      const refTable    = Array.isArray(refTableArr) ? refTableArr[0]?.table : refTableArr;
      const refCol      = def.reference_definition?.definition?.[0]?.column ?? 'id';
      if (srcCol && refTable) fkMap.set(srcCol, `${refTable}.${refCol}`);
    } else if (ct === 'unique') {
      srcCols.forEach(c => uniqueCols.add(c));
    }
  }

  const results: Omit<ColumnSchema, 'id'>[] = [];
  for (const def of columnDefs) {
    if (def.resource !== 'column') continue;
    const name    = def.column?.column ?? def.column as string;
    const sqlType = def.definition?.dataType ?? 'string';
    const dataType = mapSqlType(sqlType);
    const isPk     = def.primary_key != null || pkColumns.has(name);
    const isUnique = def.unique     != null || uniqueCols.has(name);
    const notNull  = isPk || def.nullable?.type === 'not null';
    let fkRef = fkMap.get(name);
    if (!fkRef && def.reference_definition) {
      const refTableArr = def.reference_definition?.table;
      const refTable    = Array.isArray(refTableArr) ? refTableArr[0]?.table : refTableArr;
      const refCol      = def.reference_definition?.definition?.[0]?.column ?? 'id';
      if (refTable) fkRef = `${refTable}.${refCol}`;
    }
    let indexType: IndexType = 'none';
    if (isPk)          indexType = 'primary_key';
    else if (fkRef)    indexType = 'foreign_key';
    else if (isUnique) indexType = 'unique';
    let config = defaultConfig(dataType);
    let finalType = dataType;
    if (fkRef) config.poolRef = fkRef;
    // Apply weighted realism defaults by column name (skip FKs — they pool)
    if (!fkRef) {
      const enriched = applyRealisticDefaults(name, dataType, config);
      if (enriched) { finalType = enriched.dataType; config = enriched.config; }
    }
    results.push({ name, dataType: finalType, indexType, notNull, generatorConfig: config });
  }
  return results;
}

// ─── Pure-regex fallback parser ───────────────────────────────────────────────
// Used when node-sql-parser rejects the DDL (unknown types, unsupported syntax).
// Handles any data type name — no whitelist.

function unquoteId(s: string): string {
  return s.replace(/^[`"[]+|[`"\]]+$/g, '').trim();
}

/** Split a comma-separated list respecting parenthesis depth. */
function splitAtTopCommas(body: string): string[] {
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '(') depth++;
    else if (body[i] === ')') depth--;
    else if (body[i] === ',' && depth === 0) {
      parts.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = body.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function extractColumnsFromBody(body: string): Omit<ColumnSchema, 'id'>[] {
  const parts = splitAtTopCommas(body);
  const pkCols    = new Set<string>(); // lowercase
  const uniqueCols = new Set<string>();
  const fkMap     = new Map<string, string>(); // lowercase → "Table.col"

  // First pass — table-level constraints
  for (const part of parts) {
    // strip optional CONSTRAINT name
    const stripped = part.trim().replace(/^CONSTRAINT\s+\S+\s+/i, '');

    const pkM = stripped.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
    if (pkM) { pkM[1].split(',').forEach(c => pkCols.add(unquoteId(c.trim()).toLowerCase())); continue; }

    const uqM = stripped.match(/^UNIQUE(?:\s+(?:INDEX|KEY)\s+\S+)?\s*\(([^)]+)\)/i);
    if (uqM) { uqM[1].split(',').forEach(c => uniqueCols.add(unquoteId(c.trim()).toLowerCase())); continue; }

    const fkM = stripped.match(/^FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(\S+)\s*\(([^)]+)\)/i);
    if (fkM) {
      const srcCols = fkM[1].split(',').map(c => unquoteId(c.trim()).toLowerCase());
      const refTable = unquoteId(fkM[2]);
      const refCols  = fkM[3].split(',').map(c => unquoteId(c.trim()));
      srcCols.forEach((col, i) => fkMap.set(col, `${refTable}.${refCols[i] ?? 'id'}`));
      continue;
    }
  }

  // Second pass — column definitions
  const results: Omit<ColumnSchema, 'id'>[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Skip lines that are constraints / index definitions
    if (/^(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT|INDEX|KEY|CHECK)\b/i.test(trimmed)) continue;

    // Match:  col_name  TYPE[(args)]  [rest...]
    const m = trimmed.match(/^([`"[]?\w+[`"\]]?)\s+(\w+)(?:\s*\([^)]*\))?\s*(.*)/is);
    if (!m) continue;

    const name     = unquoteId(m[1]);
    const rawType  = m[2];
    const rest     = m[3] ?? '';
    const nameLow  = name.toLowerCase();

    const dataType = mapSqlType(rawType);
    const isPk     = pkCols.has(nameLow)     || /\bPRIMARY\s+KEY\b/i.test(rest);
    const isUnique = uniqueCols.has(nameLow) || /\bUNIQUE\b/i.test(rest);
    const notNull  = isPk || /\bNOT\s+NULL\b/i.test(rest);

    let fkRef = fkMap.get(nameLow);
    if (!fkRef) {
      const refM = rest.match(/\bREFERENCES\s+(\S+)\s*\(([^)]+)\)/i);
      if (refM) fkRef = `${unquoteId(refM[1])}.${unquoteId(refM[2].trim())}`;
    }

    let indexType: IndexType = 'none';
    if (isPk)          indexType = 'primary_key';
    else if (fkRef)    indexType = 'foreign_key';
    else if (isUnique) indexType = 'unique';

    let config = defaultConfig(dataType);
    let finalType = dataType;
    if (fkRef) config.poolRef = fkRef;
    if (!fkRef) {
      const enriched = applyRealisticDefaults(name, dataType, config);
      if (enriched) { finalType = enriched.dataType; config = enriched.config; }
    }
    results.push({ name, dataType: finalType, indexType, notNull, generatorConfig: config });
  }
  return results;
}

/** Extract all CREATE TABLE blocks via brace-counting — works with any type names. */
function parseDdlFallback(ddl: string): { tableName: string; columns: Omit<ColumnSchema, 'id'>[] }[] {
  const tables: { tableName: string; columns: Omit<ColumnSchema, 'id'>[] }[] = [];
  const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"[]?\w+[`"\]]?)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = createRe.exec(ddl)) !== null) {
    const tableName = unquoteId(m[1]);
    let depth = 1, pos = m.index + m[0].length;
    while (pos < ddl.length && depth > 0) {
      if (ddl[pos] === '(') depth++;
      else if (ddl[pos] === ')') depth--;
      if (depth > 0) pos++;
    }
    const body = ddl.slice(m.index + m[0].length, pos);
    tables.push({ tableName, columns: extractColumnsFromBody(body) });
  }
  return tables;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function parseSQL(
  ddl: string,
): { columns: Omit<ColumnSchema, 'id'>[]; tableName: string; warnings: string[] } {
  const warnings: string[] = [];
  const normalized = normalizeDdl(ddl);
  let ast;
  try {
    ast = parser.astify(normalized, { database: 'PostgreSQL' });
  } catch {
    try {
      ast = parser.astify(normalized, { database: 'MySQL' });
    } catch {
      // Both parsers failed — use regex fallback
      const tables = parseDdlFallback(ddl);
      if (tables.length === 0) throw new Error('No CREATE TABLE statement found.');
      return { columns: tables[0].columns, tableName: tables[0].tableName, warnings };
    }
  }
  const stmt = Array.isArray(ast) ? ast[0] : ast;
  if (stmt?.type !== 'create' || stmt?.keyword !== 'table') {
    throw new Error('Only CREATE TABLE statements are supported.');
  }
  const tableName = stmt.table?.[0]?.table ?? 'table';
  const columns   = extractColumnsFromAst(stmt);
  if (columns.length === 0) warnings.push('No column definitions found.');
  return { columns, tableName, warnings };
}

export function parseSQLMultiple(
  ddl: string,
): { tables: { tableName: string; columns: Omit<ColumnSchema, 'id'>[] }[]; warnings: string[] } {
  const warnings: string[] = [];
  const normalized = normalizeDdl(ddl);
  let ast;
  try {
    ast = parser.astify(normalized, { database: 'PostgreSQL' });
  } catch {
    try {
      ast = parser.astify(normalized, { database: 'MySQL' });
    } catch {
      // Both parsers failed — use regex fallback
      const tables = parseDdlFallback(ddl);
      if (tables.length === 0) throw new Error('No CREATE TABLE statements found.');
      return { tables, warnings };
    }
  }
  const stmts = Array.isArray(ast) ? ast : [ast];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createStmts = stmts.filter((s: any) => s?.type === 'create' && s?.keyword === 'table');
  if (createStmts.length === 0) throw new Error('No CREATE TABLE statements found.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tables = createStmts.map((stmt: any) => {
    const tableName = stmt.table?.[0]?.table ?? 'table';
    const columns   = extractColumnsFromAst(stmt);
    if (columns.length === 0) warnings.push(`Table "${tableName}": no columns found.`);
    return { tableName, columns };
  });
  return { tables, warnings };
}
