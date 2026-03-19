/**
 * Rule engine service.
 * Evaluates compound AND conditions per row and applies actions.
 * Runs after base values are generated.
 */

import type { ConditionalRule, GeneratedRow, RuleAction, RuleOperator } from '../types/index.js';

// ─── Condition evaluation ─────────────────────────────────────────────────────

function evalOp(
  cellValue: string | number | boolean | null,
  op: RuleOperator,
  ruleValue?: string | number | boolean,
): boolean {
  if (op === 'is_null') return cellValue === null || cellValue === undefined;
  if (op === 'is_not_null') return cellValue !== null && cellValue !== undefined;

  if (cellValue === null || cellValue === undefined) return false;

  const a = cellValue;
  const b = ruleValue;

  switch (op) {
    case 'eq': return String(a) === String(b);
    case 'neq': return String(a) !== String(b);
    case 'gt': return Number(a) > Number(b);
    case 'lt': return Number(a) < Number(b);
    case 'gte': return Number(a) >= Number(b);
    case 'lte': return Number(a) <= Number(b);
    case 'contains': return String(a).toLowerCase().includes(String(b).toLowerCase());
    default: return false;
  }
}

function conditionMatches(row: GeneratedRow, rule: ConditionalRule): boolean {
  return rule.conditions.every(cond =>
    evalOp(row[cond.column], cond.op, cond.value),
  );
}

// ─── Action application ───────────────────────────────────────────────────────

function applyAction(
  row: GeneratedRow,
  rule: ConditionalRule,
  allRows: GeneratedRow[],
  rowIndex: number,
): void {
  const { actionColumn, action, actionValue } = rule;

  switch (action as RuleAction) {
    case 'set_null':
      row[actionColumn] = null;
      break;

    case 'set_not_null':
      // If already not null, no-op
      break;

    case 'set_value':
      row[actionColumn] = actionValue as string | number | boolean | null;
      break;

    case 'set_enum': {
      const values = actionValue as string[];
      if (values?.length) {
        row[actionColumn] = values[Math.floor(Math.random() * values.length)];
      }
      break;
    }

    case 'set_range': {
      const { min, max } = actionValue as { min: number; max: number };
      row[actionColumn] = Math.floor(Math.random() * (max - min + 1)) + min;
      break;
    }

    case 'derive_offset': {
      // actionValue: { sourceColumn, offsetMin, offsetMax, unit: 'days'|'hours'|'seconds'|'number' }
      const { sourceColumn, offsetMin, offsetMax, unit } = actionValue as {
        sourceColumn: string;
        offsetMin: number;
        offsetMax: number;
        unit: 'days' | 'hours' | 'seconds' | 'number';
      };
      const srcVal = row[sourceColumn];
      if (srcVal === null || srcVal === undefined) break;

      const offset = Math.floor(Math.random() * (offsetMax - offsetMin + 1)) + offsetMin;

      if (unit === 'number') {
        row[actionColumn] = Number(srcVal) + offset;
      } else {
        const ms = { days: 86400000, hours: 3600000, seconds: 1000 }[unit];
        const srcDate = new Date(String(srcVal)).getTime();
        if (!isNaN(srcDate)) {
          const result = new Date(srcDate + offset * ms);
          row[actionColumn] = unit === 'days'
            ? result.toISOString().split('T')[0]
            : result.toISOString();
        }
      }
      break;
    }

    case 'derive_compute': {
      // actionValue: { expression: 'quantity * unit_price' }
      // Simple expression evaluator — only supports col_a op col_b
      const { expression } = actionValue as { expression: string };
      const match = expression.match(/^(\w+)\s*([+\-*/])\s*(\w+)$/);
      if (match) {
        const [, left, op, right] = match;
        const l = Number(row[left] ?? left);
        const r = Number(row[right] ?? right);
        if (!isNaN(l) && !isNaN(r)) {
          switch (op) {
            case '+': row[actionColumn] = parseFloat((l + r).toFixed(4)); break;
            case '-': row[actionColumn] = parseFloat((l - r).toFixed(4)); break;
            case '*': row[actionColumn] = parseFloat((l * r).toFixed(4)); break;
            case '/': row[actionColumn] = r !== 0 ? parseFloat((l / r).toFixed(4)) : null; break;
          }
        }
      }
      break;
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function applyRules(rows: GeneratedRow[], rules: ConditionalRule[]): GeneratedRow[] {
  if (rules.length === 0) return rows;

  for (let i = 0; i < rows.length; i++) {
    for (const rule of rules) {
      if (conditionMatches(rows[i], rule)) {
        applyAction(rows[i], rule, rows, i);
      }
    }
  }

  return rows;
}
