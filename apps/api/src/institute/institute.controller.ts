import { eq, institutes } from '@erp/db';
import { AppError, effectiveSettings, type UpdateInstituteSettingsInput, updateInstituteSettingsSchema } from '@erp/shared';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators.js';
import { currentTenant } from '../common/request-context.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AuditService, TenantDb } from '../core/core.module.js';

const columns = {
  id: institutes.id,
  name: institutes.name,
  vertical: institutes.vertical,
  board: institutes.board,
  subdomain: institutes.subdomain,
  timezone: institutes.timezone,
  settings: institutes.settings,
};

/** The current institute's profile, terminology (CFG-02) and branding (CFG-05). */
@Controller('institute')
export class InstituteController {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('institute.settings.view')
  get() {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx.select(columns).from(institutes).where(eq(institutes.id, currentTenant().instituteId));
      if (!row) throw new AppError('not_found', 'Institute not found');
      return { ...row, settings: effectiveSettings(row.settings, row.vertical) };
    });
  }

  @Patch()
  @RequirePermissions('institute.settings.manage')
  update(@Body(new ZodPipe(updateInstituteSettingsSchema)) body: UpdateInstituteSettingsInput) {
    return this.tenantDb.run(async (tx) => {
      const { instituteId } = currentTenant();
      const [before] = await tx.select(columns).from(institutes).where(eq(institutes.id, instituteId)).for('update');
      if (!before) throw new AppError('not_found', 'Institute not found');
      const { name, board, terminology, branding, ...rest } = body;
      const current = effectiveSettings(before.settings, before.vertical);
      const settings = {
        ...current,
        ...rest,
        terminology: { ...current.terminology, ...terminology },
        branding: { ...current.branding, ...branding },
      };
      const [after] = await tx
        .update(institutes)
        .set({ name, board, settings })
        .where(eq(institutes.id, instituteId))
        .returning(columns);
      await this.audit.record(tx, { action: 'institute.update', entity: 'institute', entityId: instituteId, before, after });
      return after;
    });
  }
}
