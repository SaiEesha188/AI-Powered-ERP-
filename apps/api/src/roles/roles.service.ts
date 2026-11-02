import { asc, eq, permissions, rolePermissions, roles, setRolePermissions, type Tx } from '@erp/db';
import { AppError, type CreateRoleInput, type PermissionCode } from '@erp/shared';
import { Injectable } from '@nestjs/common';
import { currentContext, currentTenant } from '../common/request-context.js';
import { AuditService, TenantDb } from '../core/core.module.js';

/** Custom roles built from the permission catalogue (USR-03). */
@Injectable()
export class RolesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select({ id: roles.id, code: roles.code, name: roles.name, isSystem: roles.isSystem, permission: permissions.code })
        .from(roles)
        .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .orderBy(asc(roles.name), asc(permissions.code));
      const byId = new Map<string, { id: string; code: string; name: string; isSystem: boolean; permissions: string[] }>();
      for (const { permission, ...role } of rows) {
        const entry = byId.get(role.id) ?? { ...role, permissions: [] };
        if (permission) entry.permissions.push(permission);
        byId.set(role.id, entry);
      }
      return [...byId.values()];
    });
  }

  create(input: CreateRoleInput) {
    this.assertCanGrant(input.permissions);
    return this.tenantDb.run(async (tx) => {
      const { instituteId } = currentTenant();
      const [role] = await tx
        .insert(roles)
        .values({ instituteId, code: input.code, name: input.name, isSystem: false })
        .returning({ id: roles.id, code: roles.code, name: roles.name });
      if (!role) throw new Error('role insert returned nothing');
      await setRolePermissions(tx, { id: role.id, instituteId }, input.permissions);
      const created = { ...role, isSystem: false, permissions: [...input.permissions].sort() };
      await this.audit.record(tx, { action: 'role.create', entity: 'role', entityId: role.id, after: created });
      return created;
    });
  }

  setPermissions(roleId: string, codes: PermissionCode[]) {
    this.assertCanGrant(codes);
    return this.tenantDb.run(async (tx) => {
      const role = await this.findCustomRole(tx, roleId);
      const before = await tx
        .select({ code: permissions.code })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(eq(rolePermissions.roleId, roleId));
      await setRolePermissions(tx, role, codes);
      const after = [...codes].sort();
      await this.audit.record(tx, {
        action: 'role.permissions.set',
        entity: 'role',
        entityId: roleId,
        before: before.map((p) => p.code).sort(),
        after,
      });
      return { id: roleId, permissions: after };
    });
  }

  remove(roleId: string) {
    return this.tenantDb.run(async (tx) => {
      const role = await this.findCustomRole(tx, roleId);
      await tx.delete(roles).where(eq(roles.id, roleId));
      await this.audit.record(tx, { action: 'role.delete', entity: 'role', entityId: roleId, before: role });
    });
  }

  // System roles are platform defaults shared by every institute of a vertical; institutes
  // change behaviour by creating custom roles instead.
  private async findCustomRole(tx: Tx, roleId: string) {
    const [role] = await tx
      .select({ id: roles.id, instituteId: roles.instituteId, code: roles.code, isSystem: roles.isSystem })
      .from(roles)
      .where(eq(roles.id, roleId));
    if (!role) throw new AppError('not_found', 'Role not found');
    if (role.isSystem) throw new AppError('forbidden', 'System roles cannot be changed; create a custom role instead');
    return role;
  }

  /** Nobody can create a role more powerful than themselves. */
  private assertCanGrant(codes: readonly string[]) {
    const held = currentContext().permissions;
    const missing = codes.filter((c) => !held.has(c));
    if (missing.length) throw new AppError('forbidden', `You cannot grant permissions you do not hold: ${missing.join(', ')}`);
  }
}
