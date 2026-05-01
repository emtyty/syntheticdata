/**
 * Domain bundle templates — pre-baked multi-table projects for common domains.
 * One-click seed: pick template → get a Project with FK relations, sensible
 * faker fns, and persona groups already wired up.
 */

import { nanoid } from 'nanoid';
import type {
  ColumnSchema,
  ConditionalRule,
  DatasetSchema,
  Project,
  RuleAction,
  RuleCondition,
  RuleOperator,
} from '../types/index.js';

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  tableCount: number;
}

interface Template extends TemplateSummary {
  build: () => DatasetSchema[];
}

// ─── Helper builders ──────────────────────────────────────────────────────────

const now = () => new Date().toISOString();

function col(name: string, dataType: ColumnSchema['dataType'], opts: Partial<ColumnSchema> = {}): ColumnSchema {
  return {
    id: nanoid(),
    name,
    dataType,
    indexType: opts.indexType ?? 'none',
    notNull: opts.notNull ?? true,
    poolName: opts.poolName,
    generatorConfig: opts.generatorConfig ?? {},
    sampleValues: opts.sampleValues,
  };
}

function pkUuid(name = 'id'): ColumnSchema {
  return col(name, 'uuid', { indexType: 'primary_key', poolName: undefined });
}

function fkTo(name: string, ref: string): ColumnSchema {
  return col(name, 'uuid', {
    indexType: 'foreign_key',
    generatorConfig: { poolRef: ref, fkDistribution: 'uniform' },
  });
}

function persona(name: string, fakerFn: string, group: string): ColumnSchema {
  return col(name, 'string', { generatorConfig: { fakerFn, personaGroup: group } });
}

function fakerCol(name: string, fakerFn: string, dataType: ColumnSchema['dataType'] = 'string'): ColumnSchema {
  return col(name, dataType, { generatorConfig: { fakerFn } });
}

function table(name: string, columns: ColumnSchema[], rules: ConditionalRule[] = []): DatasetSchema {
  // Wire up poolName for PKs so FKs can reference them
  const cols = columns.map(c => ({
    ...c,
    poolName: c.indexType === 'primary_key' ? `${name}.${c.name}` : c.poolName,
  }));
  return {
    id: nanoid(),
    name,
    columns: cols,
    rules,
    sourceType: 'manual',
    createdAt: now(),
    updatedAt: now(),
  };
}

function cond(column: string, op: RuleOperator, value?: string | number | boolean): RuleCondition {
  return value !== undefined ? { column, op, value } : { column, op };
}

function rule(
  name: string,
  conditions: RuleCondition[],
  actionColumn: string,
  action: RuleAction,
  actionValue?: unknown,
): ConditionalRule {
  return { id: nanoid(), name, conditions, actionColumn, action, actionValue };
}

// ─── Templates ────────────────────────────────────────────────────────────────

const ECOMMERCE: Template = {
  id: 'ecommerce',
  name: 'E-commerce Storefront',
  description: 'Customers, products, orders, and order line items with FK relations and coherent customer personas.',
  tableCount: 4,
  build: () => [
    table('customers', [
      pkUuid('id'),
      persona('full_name', 'persona.fullName', 'customer'),
      persona('email',     'persona.email',    'customer'),
      persona('phone',     'persona.phone',    'customer'),
      persona('city',      'persona.city',     'customer'),
      persona('country',   'persona.country',  'customer'),
      col('created_at', 'datetime', { generatorConfig: { dateFrom: '2022-01-01', dateTo: '2025-12-31' } }),
    ]),
    table('products', [
      pkUuid('id'),
      fakerCol('name',        'commerce.productName'),
      fakerCol('description', 'rich.productDescription'),
      fakerCol('department',  'commerce.department'),
      fakerCol('material',    'commerce.productMaterial'),
      col('price', 'float', { generatorConfig: { fakerFn: 'commerce.price', min: 5, max: 500, precision: 2 } }),
      col('stock', 'integer', { generatorConfig: { min: 0, max: 5000 } }),
    ]),
    table('orders', [
      pkUuid('id'),
      fkTo('customer_id', 'customers.id'),
      col('status', 'enum', { generatorConfig: {
        enumValues: ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'],
        enumWeights: [10, 25, 20, 35, 7, 3],
      } }),
      col('total', 'float', { generatorConfig: { min: 10, max: 2000, precision: 2 } }),
      col('placed_at', 'datetime', { generatorConfig: { dateFrom: '2024-01-01', dateTo: '2025-12-31' } }),
    ]),
    table('order_items', [
      pkUuid('id'),
      fkTo('order_id', 'orders.id'),
      fkTo('product_id', 'products.id'),
      col('quantity', 'integer', { generatorConfig: { min: 1, max: 5 } }),
      col('unit_price', 'float', { generatorConfig: { min: 5, max: 500, precision: 2 } }),
    ]),
  ],
};

const SAAS: Template = {
  id: 'saas',
  name: 'SaaS Subscription Platform',
  description: 'Users, subscriptions, payments, and usage events. Coherent user personas across all tables.',
  tableCount: 4,
  build: () => [
    table('users', [
      pkUuid('id'),
      persona('full_name', 'persona.fullName', 'user'),
      persona('email',     'persona.email',    'user'),
      persona('username',  'persona.username', 'user'),
      persona('country',   'persona.country',  'user'),
      persona('job_title', 'persona.jobTitle', 'user'),
      col('signup_date', 'date', { generatorConfig: { dateFrom: '2022-01-01', dateTo: '2025-12-31' } }),
      col('is_active', 'boolean'),
    ]),
    table('subscriptions', [
      pkUuid('id'),
      fkTo('user_id', 'users.id'),
      col('plan', 'enum', { generatorConfig: {
        enumValues: ['free', 'starter', 'pro', 'team', 'enterprise'],
        enumWeights: [40, 30, 20, 7, 3],
      } }),
      col('status', 'enum', { generatorConfig: {
        enumValues: ['trialing', 'active', 'past_due', 'cancelled'],
        enumWeights: [10, 75, 5, 10],
      } }),
      col('mrr', 'float', { generatorConfig: { min: 0, max: 5000, precision: 2 } }),
      col('started_at', 'datetime', { generatorConfig: { dateFrom: '2023-01-01', dateTo: '2025-12-31' } }),
    ]),
    table('payments', [
      pkUuid('id'),
      fkTo('subscription_id', 'subscriptions.id'),
      col('amount',  'float', { generatorConfig: { fakerFn: 'finance.amount', min: 9, max: 5000, precision: 2 } }),
      col('currency','string', { generatorConfig: { fakerFn: 'finance.currencyCode' } }),
      col('status', 'enum', { generatorConfig: {
        enumValues: ['succeeded', 'failed', 'refunded', 'pending'],
        enumWeights: [85, 8, 4, 3],
      } }),
      col('paid_at', 'datetime', { generatorConfig: { dateFrom: '2024-01-01', dateTo: '2025-12-31' } }),
    ]),
    table('usage_events', [
      pkUuid('id'),
      fkTo('user_id', 'users.id'),
      col('event_type', 'enum', { generatorConfig: {
        enumValues: ['login', 'export', 'api_call', 'page_view', 'feature_use', 'logout'],
        enumWeights: [15, 5, 30, 35, 10, 5],
      } }),
      fakerCol('user_agent', 'internet.userAgent'),
      col('ip', 'string', { generatorConfig: { fakerFn: 'internet.ip' } }),
      col('occurred_at', 'datetime', { generatorConfig: { dateFrom: '2025-01-01', dateTo: '2025-12-31' } }),
    ]),
  ],
};

const HEALTHCARE: Template = {
  id: 'healthcare',
  name: 'Healthcare / EHR',
  description: 'Patients, providers, appointments, and prescriptions. Coherent patient personas; realistic clinical fields.',
  tableCount: 4,
  build: () => [
    table('patients', [
      pkUuid('id'),
      persona('full_name', 'persona.fullName',  'patient'),
      persona('email',     'persona.email',     'patient'),
      persona('phone',     'persona.phone',     'patient'),
      persona('birthdate', 'persona.birthdate', 'patient'),
      persona('city',      'persona.city',      'patient'),
      col('blood_type', 'enum', { generatorConfig: {
        enumValues: ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-'],
        enumWeights: [38, 34, 9, 3, 7, 6, 2, 1],
      } }),
      col('insurance_id', 'string', { generatorConfig: { pattern: '[A-Z]{3}\\d{8}' } }),
    ]),
    table('providers', [
      pkUuid('id'),
      fakerCol('full_name', 'person.fullName'),
      col('specialty', 'enum', { generatorConfig: { enumValues: [
        'General Practice', 'Cardiology', 'Pediatrics', 'Dermatology', 'Neurology',
        'Orthopedics', 'Psychiatry', 'Radiology', 'Oncology', 'Surgery',
      ] } }),
      fakerCol('email', 'internet.email'),
      fakerCol('phone', 'phone.number'),
    ]),
    table('appointments', [
      pkUuid('id'),
      fkTo('patient_id', 'patients.id'),
      fkTo('provider_id', 'providers.id'),
      col('scheduled_at', 'datetime', { generatorConfig: { dateFrom: '2025-01-01', dateTo: '2025-12-31' } }),
      col('status', 'enum', { generatorConfig: {
        enumValues: ['scheduled', 'completed', 'cancelled', 'no_show'],
        enumWeights: [15, 70, 10, 5],
      } }),
      fakerCol('reason', 'lorem.sentence'),
    ]),
    table('prescriptions', [
      pkUuid('id'),
      fkTo('patient_id', 'patients.id'),
      fkTo('provider_id', 'providers.id'),
      col('medication', 'enum', { generatorConfig: { enumValues: [
        'Atorvastatin', 'Lisinopril', 'Metformin', 'Amlodipine', 'Omeprazole',
        'Levothyroxine', 'Albuterol', 'Sertraline', 'Ibuprofen', 'Amoxicillin',
      ] } }),
      col('dosage_mg', 'integer', { generatorConfig: { min: 5, max: 1000 } }),
      col('refills', 'integer', { generatorConfig: { min: 0, max: 5 } }),
      col('issued_at', 'date', { generatorConfig: { dateFrom: '2025-01-01', dateTo: '2025-12-31' } }),
    ]),
  ],
};

// ─── Banking / Fintech (8 tables, with rules) ─────────────────────────────────

const BANKING: Template = {
  id: 'banking',
  name: 'Banking / Fintech',
  description: 'Branches, customers, accounts, cards, transactions, merchants, loans, and loan payments. Coherent customer personas; rules tie account status to balance, withdrawals to negative amounts, and loan defaults to overdue periods.',
  tableCount: 8,
  build: () => [
    table('branches', [
      pkUuid('id'),
      col('code', 'string', { generatorConfig: { pattern: 'BR[0-9]{4}' } }),
      fakerCol('name', 'company.name'),
      fakerCol('city', 'location.city'),
      fakerCol('country', 'location.country'),
      fakerCol('manager_name', 'person.fullName'),
      col('opened_at', 'date', { generatorConfig: { dateFrom: '1990-01-01', dateTo: '2024-12-31' } }),
    ]),

    table('customers', [
      pkUuid('id'),
      fkTo('branch_id', 'branches.id'),
      persona('full_name', 'persona.fullName',  'banker'),
      persona('email',     'persona.email',     'banker'),
      persona('phone',     'persona.phone',     'banker'),
      persona('birthdate', 'persona.birthdate', 'banker'),
      persona('city',      'persona.city',      'banker'),
      persona('country',   'persona.country',   'banker'),
      col('kyc_status', 'enum', { generatorConfig: {
        enumValues: ['verified', 'pending', 'rejected', 'expired'],
        enumWeights: [80, 12, 5, 3],
      } }),
      col('joined_at', 'date', { generatorConfig: { dateFrom: '2018-01-01', dateTo: '2025-12-31' } }),
    ]),

    table('accounts', [
      pkUuid('id'),
      fkTo('customer_id', 'customers.id'),
      fkTo('branch_id',   'branches.id'),
      col('account_number', 'string', { generatorConfig: { pattern: '[0-9]{12}' } }),
      col('account_type', 'enum', { generatorConfig: {
        enumValues: ['checking', 'savings', 'business', 'joint'],
        enumWeights: [50, 30, 15, 5],
      } }),
      col('balance', 'float',  { generatorConfig: { min: 0, max: 250000, precision: 2 } }),
      col('interest_rate', 'float', { generatorConfig: { min: 0, max: 5, precision: 2 } }),
      col('currency', 'enum', { generatorConfig: {
        enumValues: ['USD', 'EUR', 'GBP', 'JPY', 'VND'],
        enumWeights: [50, 25, 12, 8, 5],
      } }),
      col('status', 'enum', { generatorConfig: {
        enumValues: ['active', 'frozen', 'closed'],
        enumWeights: [88, 7, 5],
      } }),
      col('opened_at', 'date', { generatorConfig: { dateFrom: '2018-01-01', dateTo: '2025-12-31' } }),
    ], [
      // Closed accounts have zero balance
      rule('Closed accounts have zero balance',
        [cond('status', 'eq', 'closed')], 'balance', 'set_value', 0),
      // Checking accounts earn no interest
      rule('Checking accounts earn no interest',
        [cond('account_type', 'eq', 'checking')], 'interest_rate', 'set_value', 0),
    ]),

    table('cards', [
      pkUuid('id'),
      fkTo('account_id', 'accounts.id'),
      col('card_number', 'string', { generatorConfig: { pattern: '4[0-9]{15}' } }),
      col('card_type', 'enum', { generatorConfig: {
        enumValues: ['debit', 'credit', 'prepaid'],
        enumWeights: [55, 40, 5],
      } }),
      col('expiry_year', 'integer', { generatorConfig: { min: 2025, max: 2032 } }),
      col('cvv', 'string', { generatorConfig: { pattern: '[0-9]{3}' } }),
      col('status', 'enum', { generatorConfig: {
        enumValues: ['active', 'blocked', 'expired', 'lost'],
        enumWeights: [80, 8, 8, 4],
      } }),
      col('issued_at', 'date', { generatorConfig: { dateFrom: '2022-01-01', dateTo: '2025-12-31' } }),
    ]),

    table('merchants', [
      pkUuid('id'),
      fakerCol('name', 'company.name'),
      col('category', 'enum', { generatorConfig: {
        enumValues: ['groceries', 'dining', 'travel', 'fuel', 'utilities', 'entertainment', 'electronics', 'apparel', 'health'],
        enumWeights: [22, 18, 10, 8, 12, 8, 7, 9, 6],
      } }),
      col('mcc_code', 'string', { generatorConfig: { pattern: '[0-9]{4}' } }),
      fakerCol('country', 'location.country'),
    ]),

    table('transactions', [
      pkUuid('id'),
      fkTo('account_id',  'accounts.id'),
      fkTo('merchant_id', 'merchants.id'),
      col('amount', 'float', { generatorConfig: { min: 1, max: 5000, precision: 2 } }),
      col('transaction_type', 'enum', { generatorConfig: {
        enumValues: ['purchase', 'withdrawal', 'deposit', 'transfer', 'refund', 'fee'],
        enumWeights: [50, 15, 12, 12, 8, 3],
      } }),
      col('status', 'enum', { generatorConfig: {
        enumValues: ['completed', 'pending', 'declined', 'reversed'],
        enumWeights: [85, 6, 5, 4],
      } }),
      fakerCol('description', 'finance.transactionDescription'),
      col('occurred_at', 'datetime', { generatorConfig: { dateFrom: '2024-01-01', dateTo: '2025-12-31' } }),
    ], [
      // Declined transactions have a small fee instead of full amount
      rule('Declined transactions are zero',
        [cond('status', 'eq', 'declined')], 'amount', 'set_value', 0),
      // Fees are small
      rule('Fees are small amounts',
        [cond('transaction_type', 'eq', 'fee')], 'amount', 'set_range', { min: 1, max: 35 }),
    ]),

    table('loans', [
      pkUuid('id'),
      fkTo('customer_id', 'customers.id'),
      col('product_type', 'enum', { generatorConfig: {
        enumValues: ['mortgage', 'auto', 'personal', 'student', 'business'],
        enumWeights: [30, 25, 25, 12, 8],
      } }),
      col('principal', 'float', { generatorConfig: { min: 1000, max: 500000, precision: 2 } }),
      col('outstanding_balance', 'float', { generatorConfig: { min: 0, max: 500000, precision: 2 } }),
      col('interest_rate', 'float', { generatorConfig: { min: 3, max: 18, precision: 2 } }),
      col('term_months', 'integer', { generatorConfig: { min: 12, max: 360 } }),
      col('status', 'enum', { generatorConfig: {
        enumValues: ['active', 'paid_off', 'defaulted', 'in_grace'],
        enumWeights: [70, 22, 5, 3],
      } }),
      col('originated_at', 'date', { generatorConfig: { dateFrom: '2018-01-01', dateTo: '2025-06-30' } }),
    ], [
      // Paid-off loans have zero outstanding balance
      rule('Paid-off loans have zero balance',
        [cond('status', 'eq', 'paid_off')], 'outstanding_balance', 'set_value', 0),
      // Defaulted loans skew toward higher outstanding balances
      rule('Defaulted loans have large outstanding',
        [cond('status', 'eq', 'defaulted')], 'outstanding_balance', 'set_range', { min: 5000, max: 200000 }),
    ]),

    table('loan_payments', [
      pkUuid('id'),
      fkTo('loan_id', 'loans.id'),
      col('amount', 'float', { generatorConfig: { min: 50, max: 5000, precision: 2 } }),
      col('payment_type', 'enum', { generatorConfig: {
        enumValues: ['scheduled', 'extra', 'late', 'partial'],
        enumWeights: [78, 8, 9, 5],
      } }),
      col('paid_at', 'date', { generatorConfig: { dateFrom: '2022-01-01', dateTo: '2025-12-31' } }),
      col('confirmation_code', 'string', { generatorConfig: { pattern: 'PAY-[A-Z0-9]{8}' } }),
    ], [
      // Late payments incur a fee — bump amount up
      rule('Late payments include fee',
        [cond('payment_type', 'eq', 'late')], 'amount', 'set_range', { min: 200, max: 8000 }),
    ]),
  ],
};

// ─── Education / LMS (8 tables, with rules) ───────────────────────────────────

const EDUCATION: Template = {
  id: 'education',
  name: 'Education / LMS',
  description: 'Institutions, instructors, students, courses, enrollments, assignments, submissions, and grades. Coherent student personas; rules tie enrollment status to grades, late submissions to point penalties, and dropped courses to null grades.',
  tableCount: 8,
  build: () => [
    table('institutions', [
      pkUuid('id'),
      fakerCol('name', 'company.name'),
      col('type', 'enum', { generatorConfig: {
        enumValues: ['university', 'college', 'high_school', 'bootcamp', 'online'],
        enumWeights: [30, 25, 20, 10, 15],
      } }),
      fakerCol('city', 'location.city'),
      fakerCol('country', 'location.country'),
      col('founded', 'integer', { generatorConfig: { min: 1850, max: 2020 } }),
      col('student_capacity', 'integer', { generatorConfig: { min: 200, max: 50000 } }),
    ]),

    table('instructors', [
      pkUuid('id'),
      fkTo('institution_id', 'institutions.id'),
      fakerCol('full_name', 'person.fullName'),
      fakerCol('email', 'internet.email'),
      col('title', 'enum', { generatorConfig: {
        enumValues: ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'TA'],
        enumWeights: [15, 20, 25, 30, 10],
      } }),
      fakerCol('department', 'commerce.department'),
      col('hired_at', 'date', { generatorConfig: { dateFrom: '2005-01-01', dateTo: '2024-12-31' } }),
    ]),

    table('students', [
      pkUuid('id'),
      fkTo('institution_id', 'institutions.id'),
      persona('full_name', 'persona.fullName',  'student'),
      persona('email',     'persona.email',     'student'),
      persona('birthdate', 'persona.birthdate', 'student'),
      persona('city',      'persona.city',      'student'),
      persona('country',   'persona.country',   'student'),
      col('student_number', 'string', { generatorConfig: { pattern: 'STU[0-9]{7}' } }),
      col('enrolled_year', 'integer', { generatorConfig: { min: 2018, max: 2025 } }),
      col('status', 'enum', { generatorConfig: {
        enumValues: ['active', 'graduated', 'on_leave', 'withdrawn'],
        enumWeights: [70, 18, 7, 5],
      } }),
    ]),

    table('courses', [
      pkUuid('id'),
      fkTo('institution_id', 'institutions.id'),
      fkTo('instructor_id',  'instructors.id'),
      col('code', 'string', { generatorConfig: { pattern: '[A-Z]{3}-[0-9]{3}' } }),
      fakerCol('title', 'commerce.productName'),
      fakerCol('description', 'rich.productDescription'),
      col('level', 'enum', { generatorConfig: {
        enumValues: ['intro', 'intermediate', 'advanced', 'graduate'],
        enumWeights: [35, 35, 20, 10],
      } }),
      col('credits', 'integer', { generatorConfig: { min: 1, max: 6 } }),
      col('capacity', 'integer', { generatorConfig: { min: 15, max: 300 } }),
      col('term', 'enum', { generatorConfig: {
        enumValues: ['Fall 2024', 'Spring 2025', 'Summer 2025', 'Fall 2025'],
        enumWeights: [25, 30, 20, 25],
      } }),
    ]),

    table('enrollments', [
      pkUuid('id'),
      fkTo('student_id', 'students.id'),
      fkTo('course_id',  'courses.id'),
      col('enrolled_at', 'date', { generatorConfig: { dateFrom: '2024-08-01', dateTo: '2025-09-30' } }),
      col('status', 'enum', { generatorConfig: {
        enumValues: ['enrolled', 'completed', 'dropped', 'failed', 'audit'],
        enumWeights: [25, 55, 10, 6, 4],
      } }),
      col('final_grade', 'enum', { generatorConfig: {
        enumValues: ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'F'],
        enumWeights: [12, 14, 14, 16, 12, 10, 10, 7, 5],
      } }),
      col('gpa_value', 'float', { generatorConfig: { min: 0, max: 4, precision: 2 } }),
    ], [
      // Dropped enrollments have no final grade
      rule('Dropped enrollments have no grade',
        [cond('status', 'eq', 'dropped')], 'final_grade', 'set_null'),
      // Failed enrollments are graded F
      rule('Failed enrollments graded F',
        [cond('status', 'eq', 'failed')], 'final_grade', 'set_value', 'F'),
      // Failed enrollments have GPA 0
      rule('Failed enrollments have GPA 0',
        [cond('status', 'eq', 'failed')], 'gpa_value', 'set_value', 0),
      // Audit enrollments have no GPA contribution
      rule('Audit enrollments have no GPA',
        [cond('status', 'eq', 'audit')], 'gpa_value', 'set_null'),
    ]),

    table('assignments', [
      pkUuid('id'),
      fkTo('course_id', 'courses.id'),
      fakerCol('title', 'lorem.sentence'),
      col('type', 'enum', { generatorConfig: {
        enumValues: ['homework', 'quiz', 'project', 'exam', 'lab'],
        enumWeights: [40, 20, 15, 15, 10],
      } }),
      col('max_points', 'integer', { generatorConfig: { min: 10, max: 100 } }),
      col('weight_pct', 'integer', { generatorConfig: { min: 5, max: 40 } }),
      col('due_at', 'datetime', { generatorConfig: { dateFrom: '2024-09-01', dateTo: '2025-12-31' } }),
    ]),

    table('submissions', [
      pkUuid('id'),
      fkTo('assignment_id', 'assignments.id'),
      fkTo('student_id',    'students.id'),
      col('submitted_at', 'datetime', { generatorConfig: { dateFrom: '2024-09-01', dateTo: '2025-12-31' } }),
      col('points_earned', 'integer', { generatorConfig: { min: 0, max: 100 } }),
      col('status', 'enum', { generatorConfig: {
        enumValues: ['submitted', 'late', 'missing', 'graded'],
        enumWeights: [50, 12, 8, 30],
      } }),
      fakerCol('feedback', 'rich.review'),
    ], [
      // Missing submissions earn 0 points
      rule('Missing submissions earn zero',
        [cond('status', 'eq', 'missing')], 'points_earned', 'set_value', 0),
      // Late submissions get a 30-70 point penalty (capped lower)
      rule('Late submissions are penalised',
        [cond('status', 'eq', 'late')], 'points_earned', 'set_range', { min: 20, max: 70 }),
    ]),

    table('grades', [
      pkUuid('id'),
      fkTo('student_id', 'students.id'),
      fkTo('course_id',  'courses.id'),
      col('term', 'enum', { generatorConfig: {
        enumValues: ['Fall 2024', 'Spring 2025', 'Summer 2025', 'Fall 2025'],
        enumWeights: [25, 30, 20, 25],
      } }),
      col('letter_grade', 'enum', { generatorConfig: {
        enumValues: ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'F'],
        enumWeights: [12, 14, 14, 16, 12, 10, 10, 7, 5],
      } }),
      col('numeric_grade', 'float', { generatorConfig: { min: 50, max: 100, precision: 1 } }),
      col('credits_earned', 'integer', { generatorConfig: { min: 0, max: 6 } }),
      col('recorded_at', 'date', { generatorConfig: { dateFrom: '2024-12-01', dateTo: '2025-12-31' } }),
    ], [
      // Failing grade earns no credits
      rule('F grades earn no credits',
        [cond('letter_grade', 'eq', 'F')], 'credits_earned', 'set_value', 0),
      // F grade implies low numeric
      rule('F grades have low numeric score',
        [cond('letter_grade', 'eq', 'F')], 'numeric_grade', 'set_range', { min: 30, max: 59 }),
    ]),
  ],
};

// ─── Registry ─────────────────────────────────────────────────────────────────

const TEMPLATES: Template[] = [ECOMMERCE, SAAS, HEALTHCARE, BANKING, EDUCATION];

export function listTemplates(): TemplateSummary[] {
  return TEMPLATES.map(({ id, name, description, tableCount }) => ({ id, name, description, tableCount }));
}

export function buildProjectFromTemplate(templateId: string, projectName: string): Project | null {
  const tpl = TEMPLATES.find(t => t.id === templateId);
  if (!tpl) return null;
  return {
    id: nanoid(),
    name: projectName,
    tables: tpl.build(),
    createdAt: now(),
    updatedAt: now(),
  };
}
