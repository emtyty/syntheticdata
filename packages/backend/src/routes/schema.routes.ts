import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { schemaStore } from '../store/session.store.js';
import { inferFromCsv } from '../services/inference.service.js';
import { parseSQL } from '../services/sql-parser.service.js';
import { sampleValue } from '../services/generator.service.js';
import type { ColumnSchema, DatasetSchema } from '../types/index.js';

const GeneratorConfigSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  precision: z.number().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  enumValues: z.array(z.string()).optional(),
  enumWeights: z.array(z.number()).optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  pattern: z.string().optional(),
  poolRef: z.string().optional(),
  poolSampling: z.enum(['uniform', 'weighted']).optional(),
  nullRate: z.number().min(0).max(1).optional(),
  fakerFn: z.string().optional(),
  locale: z.string().optional(),
  // Advanced FK controls (Phase 3)
  fkNullRate: z.number().min(0).max(1).optional(),
  fkDistribution: z.enum(['uniform', 'weighted', 'fixed_per_parent']).optional(),
  fkChildrenPerParent: z.object({ min: z.number().int().min(0), max: z.number().int().min(1) }).optional(),
  fkValueWeights: z.array(z.object({ value: z.string(), weight: z.number() })).optional(),
  fkFixedValues: z.array(z.string()).optional(),
});

const ColumnSchemaZ = z.object({
  id: z.string(),
  name: z.string().min(1),
  dataType: z.enum(['string','integer','float','boolean','date','datetime','uuid','email','phone','url','enum','regex']),
  indexType: z.enum(['primary_key','unique','foreign_key','none']),
  poolName: z.string().optional(),
  notNull: z.boolean(),
  generatorConfig: GeneratorConfigSchema,
  sampleValues: z.array(z.string()).optional(),
});

const RuleConditionZ = z.object({
  column: z.string(),
  op: z.enum(['eq','neq','gt','lt','gte','lte','contains','is_null','is_not_null']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const ConditionalRuleZ = z.object({
  id: z.string(),
  name: z.string().optional(),
  conditions: z.array(RuleConditionZ).min(1),
  actionColumn: z.string(),
  action: z.enum(['set_null','set_not_null','set_value','set_enum','set_range','derive_offset','derive_compute']),
  actionValue: z.unknown().optional(),
});

const DatasetSchemaZ = z.object({
  name: z.string().min(1),
  columns: z.array(ColumnSchemaZ),
  rules: z.array(ConditionalRuleZ),
  sourceType: z.enum(['upload','manual','sql','prisma']),
});

function buildPoolNames(columns: ColumnSchema[]): ColumnSchema[] {
  return columns.map(col => ({
    ...col,
    poolName: col.indexType === 'primary_key' ? `${col.name}` : col.poolName,
  }));
}

export async function schemaRoutes(app: FastifyInstance) {
  // POST /schemas/infer/csv — upload CSV → infer schema
  app.post('/schemas/infer/csv', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ ok: false, error: 'No file uploaded' });

    const buffer = await data.toBuffer();
    try {
      const result = inferFromCsv(buffer);
      return { ok: true, data: result };
    } catch (e) {
      return reply.code(400).send({ ok: false, error: (e as Error).message });
    }
  });

  // POST /schemas/infer/sql — parse DDL → schema
  app.post('/schemas/infer/sql', async (req, reply) => {
    const body = req.body as { ddl?: string };
    if (!body?.ddl) return reply.code(400).send({ ok: false, error: 'Missing ddl field' });
    try {
      const result = parseSQL(body.ddl);
      return { ok: true, data: result };
    } catch (e) {
      return reply.code(400).send({ ok: false, error: (e as Error).message });
    }
  });

  // POST /schemas — save schema
  app.post('/schemas', async (req, reply) => {
    const parsed = DatasetSchemaZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.message });
    }
    const now = new Date().toISOString();
    const schema: DatasetSchema = {
      id: nanoid(),
      ...parsed.data,
      columns: buildPoolNames(parsed.data.columns as ColumnSchema[]),
      createdAt: now,
      updatedAt: now,
    };
    schemaStore.set(schema);
    return { ok: true, data: schema };
  });

  // GET /schemas
  app.get('/schemas', async () => {
    return { ok: true, data: schemaStore.list() };
  });

  // GET /schemas/:id
  app.get<{ Params: { id: string } }>('/schemas/:id', async (req, reply) => {
    const schema = schemaStore.get(req.params.id);
    if (!schema) return reply.code(404).send({ ok: false, error: 'Schema not found' });
    return { ok: true, data: schema };
  });

  // PUT /schemas/:id
  app.put<{ Params: { id: string } }>('/schemas/:id', async (req, reply) => {
    const existing = schemaStore.get(req.params.id);
    if (!existing) return reply.code(404).send({ ok: false, error: 'Schema not found' });

    const parsed = DatasetSchemaZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.message });
    }

    const updated: DatasetSchema = {
      ...existing,
      ...parsed.data,
      columns: buildPoolNames(parsed.data.columns as ColumnSchema[]),
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    schemaStore.set(updated);
    return { ok: true, data: updated };
  });

  // DELETE /schemas/:id
  app.delete<{ Params: { id: string } }>('/schemas/:id', async (req, reply) => {
    const schema = schemaStore.get(req.params.id);
    if (!schema) return reply.code(404).send({ ok: false, error: 'Schema not found' });
    schemaStore.delete(req.params.id);
    return { ok: true, data: { deleted: req.params.id } };
  });

  // GET /pools — list all registered pool names across saved schemas
  app.get('/pools', async () => {
    const pools: { poolName: string; schemaId: string; schemaName: string }[] = [];
    for (const schema of schemaStore.list()) {
      for (const col of schema.columns) {
        if (col.indexType === 'primary_key' && col.poolName) {
          pools.push({
            poolName: col.poolName,
            schemaId: schema.id,
            schemaName: schema.name,
          });
        }
      }
    }
    return { ok: true, data: pools };
  });

  // POST /sample — preview a single value for one column config
  app.post<{ Body: { column: ColumnSchema; seed?: number } }>('/sample', async (req, reply) => {
    const { column, seed } = req.body ?? {};
    if (!column?.dataType) return reply.code(400).send({ ok: false, error: 'column required' });
    try {
      const value = sampleValue(column, seed);
      return { ok: true, data: { value } };
    } catch (e) {
      return reply.code(400).send({ ok: false, error: (e as Error).message });
    }
  });
}
