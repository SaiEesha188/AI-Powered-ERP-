import { auditLogs, createDb, type Db, type Executor, type Tx, withTenant } from '@erp/db';
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { currentTenant, optionalContext } from '../common/request-context.js';
import { ConsoleSmsSender, SmsSender } from '../auth/sms.js';
import { CONFIG, type Config, loadConfig } from '../config.js';

/** RLS-enforced connection (role erp_app). Only use through TenantDb. */
export const APP_DB = Symbol('APP_DB');
/**
 * RLS-bypassing connection (role erp_system). Only for work that is not scoped to one
 * institute: authentication, tenant provisioning, global identity lookups.
 */
export const SYSTEM_DB = Symbol('SYSTEM_DB');
const POOLS = Symbol('POOLS');

/** Runs queries as the current request's institute and user, with RLS enforcing the boundary. */
@Injectable()
export class TenantDb {
  constructor(@Inject(APP_DB) private readonly db: Db) {}

  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return withTenant(this.db, currentTenant(), fn);
  }
}

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  /** Defaults to the request's institute; pass null for platform-level events. */
  instituteId?: string | null;
  /** Defaults to the request's user. */
  actorId?: string | null;
}

@Injectable()
export class AuditService {
  /** Write inside the same transaction as the change, so the log can never miss a committed change. */
  async record(tx: Executor, entry: AuditEntry) {
    const ctx = optionalContext();
    await tx.insert(auditLogs).values({
      instituteId: entry.instituteId === undefined ? (ctx?.instituteId ?? null) : entry.instituteId,
      actorId: entry.actorId === undefined ? (ctx?.userId ?? null) : entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: ctx?.ip ?? null,
    });
  }
}

@Injectable()
class PoolCloser implements OnApplicationShutdown {
  constructor(@Inject(POOLS) private readonly pools: { end(): Promise<void> }[]) {}

  async onApplicationShutdown() {
    await Promise.all(this.pools.map((p) => p.end()));
  }
}

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    {
      provide: POOLS,
      inject: [CONFIG],
      useFactory: (config: Config) => {
        const app = createDb(config.DATABASE_URL, { max: 20 });
        const system = createDb(config.SYSTEM_DATABASE_URL, { max: 5 });
        return Object.assign([app.pool, system.pool], { app: app.db, system: system.db });
      },
    },
    { provide: APP_DB, inject: [POOLS], useFactory: (p: { app: Db }) => p.app },
    { provide: SYSTEM_DB, inject: [POOLS], useFactory: (p: { system: Db }) => p.system },
    TenantDb,
    AuditService,
    PoolCloser,
    { provide: SmsSender, useClass: ConsoleSmsSender },
  ],
  exports: [CONFIG, APP_DB, SYSTEM_DB, TenantDb, AuditService, SmsSender],
})
export class CoreModule {}
