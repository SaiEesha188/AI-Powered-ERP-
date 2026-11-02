// Creates the database and login roles, runs migrations and syncs platform catalogues.
// Idempotent: safe to run on every deploy.
import { PERMISSIONS } from '@erp/shared';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { permissions, plans } from './schema/index.js';

// Role names are fixed because migrations grant privileges to them by name.
const APP_ROLE = 'erp_app';
const SYSTEM_ROLE = 'erp_system';

const DEFAULT_PLANS = [
  { code: 'starter', name: 'Starter', pricePerStudent: '0.00', messageQuota: 20_000, aiCredits: 0 },
  { code: 'standard', name: 'Standard', pricePerStudent: '0.00', messageQuota: 50_000, aiCredits: 0 },
  { code: 'premium', name: 'Premium', pricePerStudent: '0.00', messageQuota: 100_000, aiCredits: 10_000 },
];

export interface SetupOptions {
  adminUrl: string;
  appUrl: string;
  systemUrl: string;
  /** Drop and recreate the database first (tests only). */
  reset?: boolean;
  log?: (msg: string) => void;
}

function parse(url: string) {
  const u = new URL(url);
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)),
  };
}

function withDatabase(url: string, database: string) {
  const u = new URL(url);
  u.pathname = `/${encodeURIComponent(database)}`;
  return u.toString();
}

async function ensureRole(client: pg.Client, name: string, password: string, bypassRls: boolean) {
  const attrs = `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE ${bypassRls ? 'BYPASSRLS' : 'NOBYPASSRLS'}`;
  const pw = password ? ` PASSWORD ${client.escapeLiteral(password)}` : '';
  const { rowCount } = await client.query('select 1 from pg_roles where rolname = $1', [name]);
  const verb = rowCount ? 'ALTER' : 'CREATE';
  await client.query(`${verb} ROLE ${client.escapeIdentifier(name)} ${attrs}${pw}`);
}

export async function setupDatabase(opts: SetupOptions) {
  const log = opts.log ?? (() => {});
  const app = parse(opts.appUrl);
  const system = parse(opts.systemUrl);
  if (app.user !== APP_ROLE || system.user !== SYSTEM_ROLE) {
    throw new Error(`DATABASE_URL must use role ${APP_ROLE} and SYSTEM_DATABASE_URL role ${SYSTEM_ROLE}`);
  }
  if (app.database !== system.database) throw new Error('DATABASE_URL and SYSTEM_DATABASE_URL must use the same database');
  const database = app.database;

  const admin = new pg.Client({ connectionString: opts.adminUrl });
  await admin.connect();
  try {
    if (opts.reset) {
      await admin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()', [
        database,
      ]);
      await admin.query(`DROP DATABASE IF EXISTS ${admin.escapeIdentifier(database)}`);
    }
    const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [database]);
    if (!rowCount) {
      await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(database)} ENCODING 'UTF8'`);
      log(`created database ${database}`);
    }
    await ensureRole(admin, APP_ROLE, app.password, false);
    await ensureRole(admin, SYSTEM_ROLE, system.password, true);
  } finally {
    await admin.end();
  }

  const pool = new pg.Pool({ connectionString: withDatabase(opts.adminUrl, database), max: 1 });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    log('migrations applied');

    await db
      .insert(permissions)
      .values(PERMISSIONS.map((p) => ({ ...p })))
      .onConflictDoUpdate({
        target: permissions.code,
        set: { module: sql`excluded.module`, description: sql`excluded.description` },
      });
    await db.insert(plans).values(DEFAULT_PLANS).onConflictDoNothing({ target: plans.code });
    log(`catalogue synced: ${PERMISSIONS.length} permissions, ${DEFAULT_PLANS.length} plans`);
  } finally {
    await pool.end();
  }
}
