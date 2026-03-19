/**
 * Lightweight Prisma schema (.prisma) parser.
 * Handles: model blocks, scalar fields, @id, @unique, @default, @relation.
 * No external dependency — pure string/regex parsing.
 */

import { nanoid } from 'nanoid';
import type { ColumnDataType, ColumnSchema, DatasetSchema, GeneratorConfig, IndexType, Project } from '../types/index.js';

// ─── Prisma scalar → ColumnDataType ──────────────────────────────────────────

const TYPE_MAP: Record<string, ColumnDataType> = {
  String:   'string',
  Int:      'integer',
  BigInt:   'integer',
  Float:    'float',
  Decimal:  'float',
  Boolean:  'boolean',
  DateTime: 'datetime',
  Json:     'string',
  Bytes:    'string',
};

function toDataType(prismaType: string): ColumnDataType {
  return TYPE_MAP[prismaType] ?? 'string';
}

// ─── Parsed field ─────────────────────────────────────────────────────────────

interface ParsedField {
  name:       string;
  fieldType:  string;
  isArray:    boolean;
  isOptional: boolean;
  isId:       boolean;
  isUnique:   boolean;
  hasDefault: boolean;
  relation?:  { fields: string[]; references: string[] };
}

// ─── Parse @relation(fields: [...], references: [...]) ────────────────────────

function parseRelation(attrStr: string): { fields: string[]; references: string[] } | undefined {
  const fieldsMatch  = attrStr.match(/fields:\s*\[([^\]]*)\]/);
  const refsMatch    = attrStr.match(/references:\s*\[([^\]]*)\]/);
  if (!fieldsMatch || !refsMatch) return undefined;
  const parseList = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);
  return { fields: parseList(fieldsMatch[1]), references: parseList(refsMatch[1]) };
}

// ─── Parse a single field line ────────────────────────────────────────────────

function parseField(line: string): ParsedField | null {
  // Skip block-level attributes (@@id, @@unique, @@index, @@map, etc.)
  if (/^\s*@@/.test(line)) return null;
  // Skip empty / comment lines
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) return null;

  // Basic: fieldName  FieldType?[]  attributes...
  const match = trimmed.match(/^(\w+)\s+(\w+)(\?)?(\[\])?(.*)$/);
  if (!match) return null;

  const [, name, fieldType, optMark, arrMark, rest] = match;
  const attrs = rest ?? '';

  const isId       = /@id\b/.test(attrs);
  const isUnique   = /@unique\b/.test(attrs);
  const hasDefault = /@default\b/.test(attrs);

  let relation: { fields: string[]; references: string[] } | undefined;
  const relMatch = attrs.match(/@relation\(([^)]*)\)/);
  if (relMatch) relation = parseRelation(relMatch[1]);

  return {
    name,
    fieldType,
    isArray:    Boolean(arrMark),
    isOptional: Boolean(optMark),
    isId,
    isUnique,
    hasDefault,
    relation,
  };
}

// ─── Parse model blocks ───────────────────────────────────────────────────────

interface ParsedModel {
  name:   string;
  fields: ParsedField[];
}

function parseModels(source: string): ParsedModel[] {
  const models: ParsedModel[] = [];
  // Match each `model Name { ... }` block (non-greedy, handles nested braces via line scanning)
  const modelRegex = /^model\s+(\w+)\s*\{([^}]*)\}/gm;
  let m: RegExpExecArray | null;
  while ((m = modelRegex.exec(source)) !== null) {
    const name   = m[1];
    const body   = m[2];
    const fields = body.split('\n').map(parseField).filter((f): f is ParsedField => f !== null);
    models.push({ name, fields });
  }
  return models;
}

// ─── Build FK map from relation fields ───────────────────────────────────────

// Returns Map<modelName, Map<localFieldName, { referencedModel, referencedField }>>
function buildFkMap(models: ParsedModel[]): Map<string, Map<string, { referencedModel: string; referencedField: string }>> {
  const modelNames = new Set(models.map(m => m.name));
  const fkMap = new Map<string, Map<string, { referencedModel: string; referencedField: string }>>();

  for (const model of models) {
    const localFks = new Map<string, { referencedModel: string; referencedField: string }>();
    for (const field of model.fields) {
      // A relation field points to another model and has a @relation with fields/references
      if (!modelNames.has(field.fieldType) || !field.relation) continue;
      field.relation.fields.forEach((localField, i) => {
        localFks.set(localField, {
          referencedModel: field.fieldType,
          referencedField: field.relation!.references[i] ?? 'id',
        });
      });
    }
    fkMap.set(model.name, localFks);
  }
  return fkMap;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parsePrismaSchema(source: string, projectName = 'Imported Project'): Project {
  const models    = parseModels(source);
  const modelNames = new Set(models.map(m => m.name));
  const fkMap     = buildFkMap(models);
  const now       = new Date().toISOString();

  const tables: DatasetSchema[] = models.map(model => {
    const localFks = fkMap.get(model.name) ?? new Map();

    const columns: ColumnSchema[] = model.fields
      .filter(f => {
        // Skip virtual relation fields (array side, e.g. `orders Order[]`)
        if (modelNames.has(f.fieldType) && !localFks.has(f.name)) return false;
        // Skip array relation fields
        if (f.isArray && modelNames.has(f.fieldType)) return false;
        return true;
      })
      .map(f => {
        const fkInfo   = localFks.get(f.name);
        const isPk     = f.isId;
        const isUnique = f.isUnique;

        let indexType: IndexType = 'none';
        if (isPk)        indexType = 'primary_key';
        else if (fkInfo) indexType = 'foreign_key';
        else if (isUnique) indexType = 'unique';

        let dataType = toDataType(f.fieldType);
        // String @id @default → treat as UUID
        if (isPk && f.fieldType === 'String' && f.hasDefault) dataType = 'uuid';

        const generatorConfig: GeneratorConfig = {};
        if (fkInfo) {
          generatorConfig.poolRef = `${fkInfo.referencedModel}.${fkInfo.referencedField}`;
        }

        return {
          id:              nanoid(),
          name:            f.name,
          dataType,
          indexType,
          poolName:        isPk ? `${model.name}.${f.name}` : undefined,
          notNull:         !f.isOptional && !f.isArray,
          generatorConfig,
        } satisfies ColumnSchema;
      });

    return {
      id:         nanoid(),
      name:       model.name,
      columns,
      rules:      [],
      sourceType: 'prisma',
      createdAt:  now,
      updatedAt:  now,
    } satisfies DatasetSchema;
  });

  return {
    id:        nanoid(),
    name:      projectName,
    tables,
    createdAt: now,
    updatedAt: now,
  };
}
