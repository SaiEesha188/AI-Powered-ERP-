import { and, asc, assignRole, type Db, eq, findOrCreateUserByPhone, inArray, roles, type Tx, userRoles, users } from '@erp/db';
import { AppError, type AddUserInput } from '@erp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { currentTenant } from '../common/request-context.js';
import { AuditService, SYSTEM_DB, TenantDb } from '../core/core.module.js';

/** Roles that only holders of the same role may grant. */
const SELF_GRANTED_ROLES = new Set(['management']);

@Injectable()
export class UsersService {
  constructor(
    private readonly tenantDb: TenantDb,
    @Inject(SYSTEM_DB) private readonly systemDb: Db,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.tenantDb.run(async (tx) => {
      const { instituteId } = currentTenant();
      const rows = await tx
        .select({
          id: users.id,
          name: users.name,
          phone: users.phone,
          email: users.email,
          status: users.status,
          roleCode: roles.code,
          roleName: roles.name,
        })
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.userId))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        // user_roles RLS also shows the caller's own memberships elsewhere; keep only this institute.
        .where(eq(userRoles.instituteId, instituteId))
        .orderBy(asc(users.name), asc(roles.name));
      const byId = new Map<string, { id: string; name: string; phone: string | null; email: string | null; status: string; roles: { code: string; name: string }[] }>();
      for (const { roleCode, roleName, ...user } of rows) {
        const entry = byId.get(user.id) ?? { ...user, roles: [] };
        entry.roles.push({ code: roleCode, name: roleName });
        byId.set(user.id, entry);
      }
      return [...byId.values()];
    });
  }

  /**
   * Adds a person to the institute. If the phone already belongs to someone (for example a
   * parent at another school who now teaches here), the existing identity is reused (USR-01).
   */
  async add(input: AddUserInput) {
    const roleCodes = [...new Set(input.roles)];
    const identity = await this.resolveIdentity(input, roleCodes);
    return this.tenantDb.run(async (tx) => {
      await this.grantRoles(tx, identity.id, roleCodes);
      await this.audit.record(tx, {
        action: 'user.add',
        entity: 'user',
        entityId: identity.id,
        after: { phone: input.phone, roles: roleCodes, newIdentity: identity.created },
      });
      return { userId: identity.id, roles: roleCodes };
    });
  }

  /**
   * Checks the caller may grant the roles, then finds or creates the person's global identity.
   * Callers then grant the roles with grantRoles() inside their own tenant transaction.
   */
  async resolveIdentity(person: { phone: string; name: string }, roleCodes: string[]) {
    await this.tenantDb.run((tx) => this.assertAssignable(tx, roleCodes));
    // Global identity lookup needs the system connection; nothing institute-specific is exposed.
    return findOrCreateUserByPhone(this.systemDb, person);
  }

  async grantRoles(tx: Tx, userId: string, roleCodes: string[]) {
    const { instituteId } = currentTenant();
    for (const roleCode of roleCodes) await assignRole(tx, { instituteId, userId, roleCode });
  }

  removeRole(userId: string, roleCode: string) {
    return this.tenantDb.run(async (tx) => {
      const { instituteId, userId: actorId } = currentTenant();
      if (userId === actorId) throw new AppError('forbidden', 'You cannot remove your own roles');
      await this.assertAssignable(tx, [roleCode]);
      const removed = await tx
        .delete(userRoles)
        .where(
          and(
            eq(userRoles.userId, userId),
            eq(userRoles.instituteId, instituteId),
            inArray(
              userRoles.roleId,
              tx.select({ id: roles.id }).from(roles).where(eq(roles.code, roleCode)),
            ),
          ),
        )
        .returning({ id: userRoles.id });
      if (removed.length === 0) throw new AppError('not_found', 'User does not have this role');
      await this.audit.record(tx, { action: 'user.role.remove', entity: 'user', entityId: userId, before: { role: roleCode } });
    });
  }

  private async assertAssignable(tx: Tx, roleCodes: string[]) {
    const found = await tx.select({ code: roles.code }).from(roles).where(inArray(roles.code, roleCodes));
    const unknown = roleCodes.filter((c) => !found.some((r) => r.code === c));
    if (unknown.length) throw new AppError('invalid', `Unknown role: ${unknown.join(', ')}`);

    const restricted = roleCodes.filter((c) => SELF_GRANTED_ROLES.has(c));
    if (restricted.length === 0) return;
    const { instituteId, userId } = currentTenant();
    const own = await tx
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(userRoles.userId, userId), eq(userRoles.instituteId, instituteId), inArray(roles.code, restricted)));
    if (own.length < restricted.length) {
      throw new AppError('forbidden', `Only holders of these roles can grant them: ${restricted.join(', ')}`);
    }
  }
}
