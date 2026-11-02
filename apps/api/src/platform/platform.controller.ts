import { type Db, desc, eq, institutes, organizations, plans, provisionTenant, subscriptions } from '@erp/db';
import { type CreateTenantInput, createTenantSchema } from '@erp/shared';
import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { PlatformAdmin } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AuditService, SYSTEM_DB } from '../core/core.module.js';

/** M01 platform console: our own team onboards institutes here (PLT-01). */
@PlatformAdmin()
@Controller('platform/tenants')
export class PlatformController {
  constructor(
    @Inject(SYSTEM_DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  @Post()
  create(@Body(new ZodPipe(createTenantSchema)) body: CreateTenantInput) {
    return this.db.transaction(async (tx) => {
      const result = await provisionTenant(tx, body);
      await this.audit.record(tx, {
        action: 'tenant.create',
        entity: 'institute',
        entityId: result.instituteId,
        after: body,
        instituteId: result.instituteId,
      });
      return result;
    });
  }

  @Get()
  list() {
    return this.db
      .select({
        instituteId: institutes.id,
        name: institutes.name,
        subdomain: institutes.subdomain,
        vertical: institutes.vertical,
        status: institutes.status,
        organizationId: organizations.id,
        organizationName: organizations.name,
        organizationStatus: organizations.status,
        plan: plans.code,
        seats: subscriptions.seats,
        renewalDate: subscriptions.renewalDate,
      })
      .from(institutes)
      .innerJoin(organizations, eq(organizations.id, institutes.organizationId))
      .leftJoin(plans, eq(plans.id, organizations.planId))
      .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
      .orderBy(desc(institutes.createdAt));
  }
}
