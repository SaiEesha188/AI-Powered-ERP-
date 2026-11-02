import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Anything that can run queries: the pool-backed db or an open transaction. */
export type Executor = Db | Tx;

export function createDb(url: string, options: { max?: number } = {}) {
  const pool = new pg.Pool({ connectionString: url, max: options.max ?? 10 });
  const db: Db = drizzle(pool, { schema });
  return { db, pool };
}

export interface TenantContext {
  instituteId: string;
  userId: string;
}

/**
 * Runs fn in a transaction whose RLS context is the given institute and user.
 * Must be used with the erp_app connection; set_config(..., true) scopes the
 * values to this transaction, so pooled connections never leak a tenant.
 */
export function withTenant<T>(db: Db, ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.institute_id', ${ctx.instituteId}, true), set_config('app.user_id', ${ctx.userId}, true)`,
    );
    return fn(tx);
  });
}
