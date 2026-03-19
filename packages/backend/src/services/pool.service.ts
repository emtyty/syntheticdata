/**
 * Named value pool registry.
 * PK columns register their generated values here.
 * FK columns pick from pools by name.
 *
 * Scoped per generation job — created fresh for each run.
 */

import type { GeneratedRow } from '../types/index.js';

export class PoolRegistry {
  private pools = new Map<string, (string | number)[]>();

  register(poolName: string, values: (string | number)[]) {
    this.pools.set(poolName, values);
  }

  get(poolName: string): (string | number)[] {
    const pool = this.pools.get(poolName);
    if (!pool) throw new Error(`Pool "${poolName}" not found. Make sure the PK column is generated before FK columns.`);
    return pool;
  }

  has(poolName: string): boolean {
    return this.pools.has(poolName);
  }

  listNames(): string[] {
    return Array.from(this.pools.keys());
  }

  entries(): IterableIterator<[string, (string | number)[]]> {
    return this.pools.entries();
  }

  /** Build pools from already-generated columns (used for FK columns referencing earlier columns in same schema) */
  buildFromRows(rows: GeneratedRow[], columnName: string, poolName: string) {
    const values = rows
      .map(r => r[columnName])
      .filter((v): v is string | number => v !== null && v !== undefined);
    this.register(poolName, [...new Set(values)]);
  }
}
