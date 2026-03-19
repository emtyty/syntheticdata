// ─── Column & Schema ──────────────────────────────────────────────────────────

export type ColumnDataType =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'uuid'
  | 'email'
  | 'phone'
  | 'url'
  | 'enum'
  | 'regex';

export type IndexType = 'primary_key' | 'unique' | 'foreign_key' | 'none';

export type PoolSampling = 'uniform' | 'weighted';

export interface GeneratorConfig {
  // numbers
  min?: number;
  max?: number;
  precision?: number;
  // dates
  dateFrom?: string;
  dateTo?: string;
  // enum
  enumValues?: string[];
  enumWeights?: number[];
  // string
  minLength?: number;
  maxLength?: number;
  // regex
  pattern?: string;
  // FK / pool
  poolRef?: string;            // e.g. "products.id"
  poolSampling?: PoolSampling;
  // nulls
  nullRate?: number;           // 0–1, forced 0 when notNull
  // explicit Faker function override (e.g. "person.fullName", "location.city")
  // takes priority over semantic column-name detection
  fakerFn?: string;
  // locale (Faker)
  locale?: string;
}

export interface ColumnSchema {
  id: string;
  name: string;
  dataType: ColumnDataType;
  indexType: IndexType;
  poolName?: string;           // auto-set when indexType === 'primary_key'
  notNull: boolean;
  generatorConfig: GeneratorConfig;
  sampleValues?: string[];     // from CSV inference, display only
}

// ─── Conditional Rules ────────────────────────────────────────────────────────

export type RuleOperator =
  | 'eq' | 'neq'
  | 'gt' | 'lt' | 'gte' | 'lte'
  | 'contains'
  | 'is_null' | 'is_not_null';

export type RuleAction =
  | 'set_null'
  | 'set_not_null'
  | 'set_value'
  | 'set_enum'
  | 'set_range'
  | 'derive_offset'   // target = source_col + offset (dates/numbers)
  | 'derive_compute'; // target = expr (e.g. "quantity * unit_price")

export interface RuleCondition {
  column: string;
  op: RuleOperator;
  value?: string | number | boolean;
}

export interface ConditionalRule {
  id: string;
  name?: string;
  conditions: RuleCondition[];  // AND-joined
  actionColumn: string;
  action: RuleAction;
  actionValue?: unknown;        // depends on action type
}

// ─── Dataset Schema ───────────────────────────────────────────────────────────

export type SourceType = 'upload' | 'manual' | 'sql' | 'prisma';

export interface DatasetSchema {
  id: string;
  name: string;
  columns: ColumnSchema[];
  rules: ConditionalRule[];
  sourceType: SourceType;
  createdAt: string;
  updatedAt: string;
}

// ─── Project (multi-table) ────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  tables: DatasetSchema[];       // each element is one table
  createdAt: string;
  updatedAt: string;
}

// ─── Generation Job ───────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'running' | 'done' | 'error';

export type GeneratedRow = Record<string, string | number | boolean | null>;

export interface TableRowConfig {
  tableId: string;
  rowCount: number;
}

export interface GenerationJob {
  id: string;
  // single-table (legacy)
  schemaId?: string;
  rowCount?: number;
  result?: GeneratedRow[];
  // multi-table project
  projectId?: string;
  tableConfigs?: TableRowConfig[];
  results?: Record<string, GeneratedRow[]>;   // tableId → rows
  // common
  status: JobStatus;
  progress: number;             // 0–100
  seed: number;
  errorMessage?: string;
  createdAt: string;
}

// ─── API Response wrappers ────────────────────────────────────────────────────

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
}

export type ApiResponse<T> = ApiOk<T> | ApiError;

// ─── Inference result ─────────────────────────────────────────────────────────

export interface InferredSchema {
  columns: Omit<ColumnSchema, 'id'>[];
  rowCount: number;
  warnings: string[];
}
