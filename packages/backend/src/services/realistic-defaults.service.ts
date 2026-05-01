/**
 * Weighted realism defaults — when a column's name (and optionally inferred
 * values) match a known semantic pattern, return a weighted enum or biased
 * range that produces realistic-looking distributions instead of uniform
 * random data.
 *
 * Used by:
 * - inference.service.ts after CSV type detection
 * - sql-parser.service.ts when assigning default configs from column names
 *
 * Users can always override these defaults in the schema editor.
 */

import type { ColumnDataType, GeneratorConfig } from '../types/index.js';

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface RealisticEnum {
  patterns: string[];
  values: string[];
  weights: number[];
}

const REALISTIC_ENUMS: RealisticEnum[] = [
  // Top-12 country codes by global internet population (rough order)
  {
    patterns: ['country', 'countrycode', 'nationality'],
    values: ['US', 'CN', 'IN', 'BR', 'JP', 'DE', 'GB', 'FR', 'ID', 'MX', 'VN', 'KR'],
    weights: [28, 12, 11, 7, 6, 5, 5, 4, 4, 3, 3, 2],
  },
  {
    patterns: ['currency', 'currencycode'],
    values: ['USD', 'EUR', 'JPY', 'GBP', 'CNY', 'AUD', 'CAD', 'CHF', 'VND'],
    weights: [42, 22, 8, 7, 6, 4, 4, 3, 2],
  },
  {
    patterns: ['gender', 'sex'],
    values: ['Male', 'Female', 'Non-binary', 'Prefer not to say'],
    weights: [49, 49, 1, 1],
  },
  // Order/transaction status
  {
    patterns: ['orderstatus', 'transactionstatus'],
    values: ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'],
    weights: [10, 25, 20, 35, 7, 3],
  },
  // Subscription plan tier (free is most common, enterprise rarest)
  {
    patterns: ['plan', 'tier', 'plantype'],
    values: ['free', 'starter', 'pro', 'team', 'enterprise'],
    weights: [40, 30, 20, 7, 3],
  },
  // Generic activity status (skewed active)
  {
    patterns: ['accountstatus', 'userstatus', 'subscriptionstatus'],
    values: ['active', 'inactive', 'suspended', 'pending'],
    weights: [70, 18, 4, 8],
  },
  // Locales — biased toward English/Western web population
  {
    patterns: ['language', 'languagecode', 'locale'],
    values: ['en', 'es', 'zh', 'ja', 'de', 'fr', 'pt', 'vi', 'ru', 'ko'],
    weights: [40, 12, 10, 8, 7, 6, 5, 5, 4, 3],
  },
];

interface RealisticIntRange {
  patterns: string[];
  /** Realistic min-max for the named column (e.g. age 18-75). */
  min: number;
  max: number;
}

const REALISTIC_INT_RANGES: RealisticIntRange[] = [
  { patterns: ['age'], min: 18, max: 75 },
  { patterns: ['rating', 'stars'], min: 1, max: 5 },
  { patterns: ['quantity', 'qty'], min: 1, max: 10 },
  { patterns: ['discount', 'discountpercent'], min: 0, max: 50 },
  { patterns: ['yearofbirth', 'birthyear'], min: 1950, max: 2007 },
];

/**
 * Given a column name + currently-detected type/config, return a richer
 * config with realistic weights/ranges if the column matches a known pattern.
 * Returns null if no pattern matches, so the caller keeps its current config.
 */
export function applyRealisticDefaults(
  columnName: string,
  dataType: ColumnDataType,
  currentConfig: GeneratorConfig,
): { dataType: ColumnDataType; config: GeneratorConfig } | null {
  const norm = normalize(columnName);

  // Weighted enum: only if the user hasn't already set an explicit enum
  if (dataType !== 'enum' || !(currentConfig.enumValues && currentConfig.enumValues.length > 0)) {
    for (const entry of REALISTIC_ENUMS) {
      if (entry.patterns.includes(norm)) {
        return {
          dataType: 'enum',
          config: {
            ...currentConfig,
            enumValues: entry.values,
            enumWeights: entry.weights,
          },
        };
      }
    }
  }

  // Integer ranges: tighten min/max to realistic bounds
  if (dataType === 'integer') {
    for (const entry of REALISTIC_INT_RANGES) {
      if (entry.patterns.includes(norm)) {
        return {
          dataType: 'integer',
          config: { ...currentConfig, min: entry.min, max: entry.max },
        };
      }
    }
  }

  return null;
}
