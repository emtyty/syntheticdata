/**
 * ER JSON parser.
 *
 * Accepts a JSON document describing a relational schema in this shape:
 *
 * {
 *   "database":     "DBName",                   (optional, used as project name fallback)
 *   "description":  "...",                      (optional)
 *   "tables": {
 *     "TableName": {
 *       "columns": {
 *         "ColName": {
 *           "type":              "uuid"|"int"|"string"|"datetime"|...,
 *           "nullable":          true|false,
 *           "is_primary_key":    true,           (optional — alternative to primary_key array)
 *           "references":        "Table.Col",    (optional self/inline FK)
 *           "max_length":        256,            (optional)
 *           "default":           "...",          (optional, ignored)
 *           "is_row_version":    true            (optional, ignored)
 *         }
 *       },
 *       "primary_key": ["ColName"],              (optional — preferred over is_primary_key)
 *       "indexes":     [{ columns: [...], unique: bool }]   (optional, used to mark unique)
 *     }
 *   },
 *   "relationships": [
 *     { "from_table": "T1", "from_column": "C1", "to_table": "T2", "to_column": "C2" }
 *   ]
 * }
 *
 * Composite PKs collapse to the first column (rest are demoted to `unique` if
 * not already FKs). Unknown column types fall back to `string`.
 */

import { nanoid } from 'nanoid';
import type {
  ColumnDataType,
  ColumnSchema,
  DatasetSchema,
  GeneratorConfig,
  IndexType,
  Project,
} from '../types/index.js';

// ─── Type mapping ────────────────────────────────────────────────────────────

const TYPE_MAP: Record<string, ColumnDataType> = {
  uuid:       'uuid',
  guid:       'uuid',
  string:     'string',
  text:       'string',
  varchar:    'string',
  nvarchar:   'string',
  char:       'string',
  json:       'string',
  binary:     'string',
  int:        'integer',
  integer:    'integer',
  bigint:     'integer',
  smallint:   'integer',
  tinyint:    'integer',
  boolean:    'boolean',
  bool:       'boolean',
  bit:        'boolean',
  date:       'date',
  datetime:   'datetime',
  datetime2:  'datetime',
  timestamp:  'datetime',
  time:       'datetime',
  float:      'float',
  double:     'float',
  decimal:    'float',
  numeric:    'float',
  money:      'float',
  email:      'email',
  phone:      'phone',
  url:        'url',
};

function toDataType(raw: string): ColumnDataType {
  return TYPE_MAP[raw.toLowerCase()] ?? 'string';
}

// ─── Shape types (loose — we validate at runtime) ────────────────────────────

interface ErColumn {
  type?: string;
  nullable?: boolean;
  is_primary_key?: boolean;
  references?: string;
  max_length?: number;
  default?: unknown;
  is_row_version?: boolean;
  enum_name?: string;
}

interface ErIndex {
  columns?: string[];
  unique?: boolean;
  name?: string;
}

interface ErTable {
  columns?: Record<string, ErColumn>;
  primary_key?: string[];
  indexes?: ErIndex[];
}

interface ErRelationship {
  from_table?: string;
  from_column?: string;
  to_table?: string;
  to_column?: string;
}

interface ErDocument {
  database?: string;
  tables?: Record<string, ErTable>;
  relationships?: ErRelationship[];
}

// ─── Parser entry point ──────────────────────────────────────────────────────

export interface ErParseResult {
  project: Project;
  warnings: string[];
}

export function parseErJson(rawSource: string, projectName?: string): ErParseResult {
  let doc: ErDocument;
  try {
    doc = JSON.parse(rawSource) as ErDocument;
  } catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`);
  }

  if (!doc || typeof doc !== 'object') {
    throw new Error('ER document must be a JSON object');
  }
  if (!doc.tables || typeof doc.tables !== 'object') {
    throw new Error('ER document is missing a "tables" object');
  }

  const warnings: string[] = [];
  const tableEntries = Object.entries(doc.tables);
  if (tableEntries.length === 0) {
    throw new Error('ER document contains no tables');
  }

  // ── Step 1: collect FK targets per (table, column) ────────────────────────
  // Sources: top-level relationships + inline column.references.
  const fkMap = new Map<string, Map<string, string>>(); // tableName → (colName → "Table.Col")

  function addFk(tableName: string, colName: string, target: string) {
    if (!fkMap.has(tableName)) fkMap.set(tableName, new Map());
    fkMap.get(tableName)!.set(colName, target);
  }

  // Top-level relationships
  if (Array.isArray(doc.relationships)) {
    for (const r of doc.relationships) {
      if (!r.from_table || !r.from_column || !r.to_table || !r.to_column) {
        warnings.push(`Skipping malformed relationship: ${JSON.stringify(r)}`);
        continue;
      }
      if (!doc.tables[r.from_table]) {
        warnings.push(`Relationship references unknown table "${r.from_table}"`);
        continue;
      }
      if (!doc.tables[r.to_table]) {
        warnings.push(`Relationship references unknown table "${r.to_table}"`);
        continue;
      }
      addFk(r.from_table, r.from_column, `${r.to_table}.${r.to_column}`);
    }
  }

  // Inline column.references — fall back when no top-level relationship
  // already covers this column.
  for (const [tableName, table] of tableEntries) {
    if (!table?.columns) continue;
    for (const [colName, col] of Object.entries(table.columns)) {
      if (!col?.references) continue;
      if (fkMap.get(tableName)?.has(colName)) continue;
      const ref = col.references;
      const dot = ref.indexOf('.');
      if (dot < 1 || dot === ref.length - 1) {
        warnings.push(`Invalid inline reference "${ref}" on ${tableName}.${colName} (expected "Table.Col")`);
        continue;
      }
      const refTable = ref.slice(0, dot);
      if (!doc.tables[refTable]) {
        warnings.push(`Inline reference on ${tableName}.${colName} points to unknown table "${refTable}"`);
        continue;
      }
      addFk(tableName, colName, ref);
    }
  }

  // ── Step 2: collect per-table unique columns from single-col unique indexes
  const uniqueMap = new Map<string, Set<string>>();
  for (const [tableName, table] of tableEntries) {
    if (!Array.isArray(table?.indexes)) continue;
    const set = new Set<string>();
    for (const idx of table.indexes) {
      if (idx.unique && Array.isArray(idx.columns) && idx.columns.length === 1) {
        set.add(idx.columns[0]);
      }
    }
    if (set.size > 0) uniqueMap.set(tableName, set);
  }

  // ── Step 3: build tables ──────────────────────────────────────────────────
  const now = new Date().toISOString();

  const tables: DatasetSchema[] = tableEntries.map(([tableName, table]) => {
    const colsObj = table.columns ?? {};
    const colEntries = Object.entries(colsObj);
    if (colEntries.length === 0) {
      warnings.push(`Table "${tableName}" has no columns`);
    }

    // Resolve PK: prefer primary_key array; fall back to is_primary_key flags
    const declaredPk = Array.isArray(table.primary_key) ? table.primary_key.filter(Boolean) : [];
    const pkSet = new Set<string>(declaredPk);
    if (pkSet.size === 0) {
      for (const [colName, col] of colEntries) {
        if (col?.is_primary_key) pkSet.add(colName);
      }
    }
    if (pkSet.size > 1) {
      // Collapse composite PK: keep first declared, demote rest
      const ordered = declaredPk.length > 0 ? declaredPk : Array.from(pkSet);
      const primary = ordered[0];
      const demoted = ordered.slice(1);
      pkSet.clear();
      pkSet.add(primary);
      warnings.push(
        `Table "${tableName}" has composite PK [${ordered.join(', ')}]; ` +
        `using "${primary}" as the primary key (others marked unique).`,
      );
      // Promote demoted to unique
      const uq = uniqueMap.get(tableName) ?? new Set<string>();
      for (const d of demoted) uq.add(d);
      uniqueMap.set(tableName, uq);
    }

    const fkColMap = fkMap.get(tableName);
    const uniqueCols = uniqueMap.get(tableName) ?? new Set<string>();

    const columns: ColumnSchema[] = colEntries.map(([colName, col]) => {
      const rawType = col?.type ?? 'string';
      let dataType: ColumnDataType = toDataType(rawType);
      if (col?.is_row_version) dataType = 'string'; // SQL row version → opaque blob

      const isPk = pkSet.has(colName);
      const isFk = fkColMap?.has(colName) ?? false;

      let indexType: IndexType = 'none';
      if (isPk)              indexType = 'primary_key';
      else if (isFk)         indexType = 'foreign_key';
      else if (uniqueCols.has(colName)) indexType = 'unique';

      const generatorConfig: GeneratorConfig = {};
      if (isFk) {
        generatorConfig.poolRef = fkColMap!.get(colName)!;
      }
      if (typeof col?.max_length === 'number' && col.max_length > 0 && dataType === 'string') {
        generatorConfig.maxLength = col.max_length;
      }

      return {
        id:       nanoid(),
        name:     colName,
        dataType,
        indexType,
        poolName: isPk ? `${tableName}.${colName}` : undefined,
        notNull:  col?.nullable === false,
        generatorConfig,
      } satisfies ColumnSchema;
    });

    return {
      id:         nanoid(),
      name:       tableName,
      columns,
      rules:      [],
      sourceType: 'er',
      createdAt:  now,
      updatedAt:  now,
    } satisfies DatasetSchema;
  });

  const project: Project = {
    id:        nanoid(),
    name:      projectName?.trim() || doc.database?.trim() || 'Imported ER Project',
    tables,
    createdAt: now,
    updatedAt: now,
  };

  return { project, warnings };
}
