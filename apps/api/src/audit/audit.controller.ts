import { and, auditLogs, desc, eq, lt } from '@erp/db';
import { Controller, Get, Module, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { TenantDb } from '../core/core.module.js';

const querySchema = z.object({
  entity: z.string().max(50).optional(),
  entityId: z.uuid().optional(),
  /** Cursor: pass the `at` of the last row from the previous page. */
  before: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly tenantDb: TenantDb) {}

  @Get()
  @RequirePermissions('audit.view')
  list(@Query(new ZodPipe(querySchema)) q: z.infer<typeof querySchema>) {
    return this.tenantDb.run((tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(
            q.entity ? eq(auditLogs.entity, q.entity) : undefined,
            q.entityId ? eq(auditLogs.entityId, q.entityId) : undefined,
            q.before ? lt(auditLogs.at, new Date(q.before)) : undefined,
          ),
        )
        .orderBy(desc(auditLogs.at))
        .limit(q.limit),
    );
  }
}

@Module({ controllers: [AuditController] })
export class AuditModule {}
