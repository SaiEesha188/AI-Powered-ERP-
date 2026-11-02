// Tenant provisioning and identity helpers shared by the API and the seed script.
import { AppError, defaultSettings, SYSTEM_ROLES, type CreateTenantInput, type PermissionCode } from '@erp/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Executor, Tx } from './client.js';
import {
  institutes,
  organizations,
  permissions,
  plans,
  rolePermissions,
  roles,
  subscriptions,
  userRoles,
  users,
} from './schema/index.js';

/**
 * Finds the global identity for a phone number or creates it (USR-01).
 * Needs the system connection: RLS deliberately hides users of other institutes,
 * so the app connection cannot tell whether a phone is already registered.
 */
export async function findOrCreateUserByPhone(systemDb: Executor, input: { phone: string; name: string }) {
  const [created] = await systemDb
    .insert(users)
    .values({ phone: input.phone, name: input.name })
    .onConflictDoNothing({ target: users.phone })
    .returning({ id: users.id });
  if (created) return { id: created.id, created: true };
  const [existing] = await systemDb.select({ id: users.id }).from(users).where(eq(users.phone, input.phone));
  if (!existing) throw new Error(`user for ${input.phone} vanished during upsert`);
  return { id: existing.id, created: false };
}

export async function setRolePermissions(
  tx: Executor,
  role: { id: string; instituteId: string },
  codes: readonly PermissionCode[],
) {
  await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
  if (codes.length === 0) return;
  const rows = await tx.select({ id: permissions.id }).from(permissions).where(inArray(permissions.code, [...codes]));
  if (rows.length !== new Set(codes).size) throw new AppError('invalid', 'Unknown permission code');
  await tx
    .insert(rolePermissions)
    .values(rows.map((p) => ({ roleId: role.id, permissionId: p.id, instituteId: role.instituteId })));
}

export async function assignRole(tx: Executor, input: { instituteId: string; userId: string; roleCode: string }) {
  const [role] = await tx
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.instituteId, input.instituteId), eq(roles.code, input.roleCode)));
  if (!role) throw new AppError('invalid', `Unknown role: ${input.roleCode}`);
  await tx
    .insert(userRoles)
    .values({ userId: input.userId, roleId: role.id, instituteId: input.instituteId })
    .onConflictDoNothing();
  return role.id;
}

function addOneYear(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * PLT-01: creates the organization, its first institute with the vertical pack applied,
 * the system roles, a subscription and the institute's first admin. Run in one system transaction.
 */
export async function provisionTenant(tx: Tx, input: CreateTenantInput, today = new Date().toISOString().slice(0, 10)) {
  const [plan] = await tx
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.code, input.planCode), eq(plans.isActive, true)));
  if (!plan) throw new AppError('invalid', `Unknown plan: ${input.planCode}`);

  const [org] = await tx
    .insert(organizations)
    .values({ name: input.organization.name, type: input.organization.type, planId: plan.id })
    .returning({ id: organizations.id });
  if (!org) throw new Error('organization insert returned nothing');

  await tx.insert(subscriptions).values({
    organizationId: org.id,
    planId: plan.id,
    seats: input.seats,
    startDate: today,
    renewalDate: addOneYear(today),
  });

  const [institute] = await tx
    .insert(institutes)
    .values({
      organizationId: org.id,
      name: input.institute.name,
      vertical: input.institute.vertical,
      board: input.institute.board,
      subdomain: input.institute.subdomain,
      settings: defaultSettings(input.institute.vertical),
    })
    .returning({ id: institutes.id });
  if (!institute) throw new Error('institute insert returned nothing');

  for (const [code, def] of Object.entries(SYSTEM_ROLES)) {
    const [role] = await tx
      .insert(roles)
      .values({ instituteId: institute.id, code, name: def.name, isSystem: true })
      .returning({ id: roles.id });
    if (!role) throw new Error('role insert returned nothing');
    await setRolePermissions(tx, { id: role.id, instituteId: institute.id }, def.permissions);
  }

  const admin = await findOrCreateUserByPhone(tx, input.admin);
  await assignRole(tx, { instituteId: institute.id, userId: admin.id, roleCode: 'admin' });

  return { organizationId: org.id, instituteId: institute.id, adminUserId: admin.id };
}
