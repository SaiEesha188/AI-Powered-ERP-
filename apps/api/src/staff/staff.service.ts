import { and, asc, eq, inArray, or, roles, sections, staff, teacherAssignments, type Tx, userRoles, users } from '@erp/db';
import { AppError, type CreateStaffInput, type UpdateStaffInput } from '@erp/shared';
import { Injectable } from '@nestjs/common';
import { currentTenant } from '../common/request-context.js';
import { AuditService, TenantDb } from '../core/core.module.js';
import { UsersService } from '../users/users.service.js';

const staffColumns = {
  id: staff.id,
  userId: staff.userId,
  name: users.name,
  phone: users.phone,
  employeeCode: staff.employeeCode,
  designation: staff.designation,
  joiningDate: staff.joiningDate,
  status: staff.status,
};

/** Staff profiles (STF-01) and the staff directory (STF-04). */
@Injectable()
export class StaffService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.tenantDb.run(async (tx) => {
      const { instituteId } = currentTenant();
      const rows = await tx
        .select(staffColumns)
        .from(staff)
        .innerJoin(users, eq(users.id, staff.userId))
        .orderBy(asc(users.name));
      const roleRows = rows.length
        ? await tx
            .select({ userId: userRoles.userId, code: roles.code })
            .from(userRoles)
            .innerJoin(roles, eq(roles.id, userRoles.roleId))
            .where(and(eq(userRoles.instituteId, instituteId), inArray(userRoles.userId, rows.map((r) => r.userId))))
        : [];
      return rows.map((r) => ({ ...r, roles: roleRows.filter((x) => x.userId === r.userId).map((x) => x.code).sort() }));
    });
  }

  /** Adds a staff member: their login identity, their roles and their profile, in one call. */
  async create(input: CreateStaffInput) {
    const roleCodes = [...new Set(input.roles)];
    const identity = await this.users.resolveIdentity(input, roleCodes);
    return this.tenantDb.run(async (tx) => {
      await this.users.grantRoles(tx, identity.id, roleCodes);
      const [row] = await tx
        .insert(staff)
        .values({
          instituteId: currentTenant().instituteId,
          userId: identity.id,
          employeeCode: input.employeeCode ?? null,
          designation: input.designation,
          joiningDate: input.joiningDate ?? null,
        })
        .returning({ id: staff.id });
      const created = await this.find(tx, row!.id);
      await this.audit.record(tx, { action: 'staff.create', entity: 'staff', entityId: created.id, after: { ...created, roles: roleCodes } });
      return { ...created, roles: roleCodes.sort() };
    });
  }

  update(id: string, input: UpdateStaffInput) {
    return this.tenantDb.run(async (tx) => {
      const before = await this.find(tx, id, { lock: true });
      if (input.status === 'left' && before.status !== 'left') await this.assertNothingToHandOver(tx, id);
      await tx.update(staff).set(input).where(eq(staff.id, id));
      const after = await this.find(tx, id);
      await this.audit.record(tx, { action: 'staff.update', entity: 'staff', entityId: id, before, after });
      return after;
    });
  }

  private async find(tx: Tx, id: string, opts: { lock?: boolean } = {}) {
    const query = tx.select(staffColumns).from(staff).innerJoin(users, eq(users.id, staff.userId)).where(eq(staff.id, id));
    const [row] = await (opts.lock ? query.for('update', { of: staff }) : query);
    if (!row) throw new AppError('not_found', 'Staff member not found');
    return row;
  }

  // A leaver's classes must be reassigned first, otherwise sections silently lose their teacher.
  private async assertNothingToHandOver(tx: Tx, staffId: string) {
    const [assigned] = await tx
      .select({ id: sections.id })
      .from(sections)
      .leftJoin(teacherAssignments, eq(teacherAssignments.sectionId, sections.id))
      .where(or(eq(sections.classTeacherId, staffId), eq(teacherAssignments.staffId, staffId)))
      .limit(1);
    if (assigned) throw new AppError('conflict', 'Reassign this person’s sections and subjects before marking them as left');
  }
}
