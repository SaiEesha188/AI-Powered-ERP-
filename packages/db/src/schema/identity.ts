// Identity and access (ERD 1): one users row per person, roles held per institute via user_roles.
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { institutes, timestamps } from './platform.js';

export const userStatus = pgEnum('user_status', ['active', 'disabled']);

// Global identity, not tenant data: the same phone can be a teacher at one institute and a
// parent at another (USR-01). Rows are visible through RLS only to the user themselves and to
// institutes where they hold a role.
export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    phone: text().unique(),
    email: text().unique(),
    username: text().unique(),
    name: text().notNull(),
    passwordHash: text('password_hash'),
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    status: userStatus().notNull().default('active'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('users_has_identifier', sql`coalesce(${t.phone}, ${t.email}, ${t.username}) is not null`),
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
  ],
);

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: uuid().primaryKey().defaultRandom(),
    phone: text().notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('otp_codes_phone_created').on(t.phone, t.createdAt)],
);

// One row per signed-in device (USR-07). Only a hash of the refresh token is stored.
export const sessions = pgTable(
  'sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    userAgent: text('user_agent'),
    ip: text(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('sessions_user').on(t.userId)],
);

// Foreign-key checks bypass RLS, so a plain role_id FK would let one institute reference
// another institute's role. Including institute_id in the key makes that impossible.
function sameInstituteRole(name: string, roleId: AnyPgColumn, instituteId: AnyPgColumn) {
  return foreignKey({ name, columns: [roleId, instituteId], foreignColumns: [roles.id, roles.instituteId] }).onDelete(
    'cascade',
  );
}

export const permissions = pgTable('permissions', {
  id: uuid().primaryKey().defaultRandom(),
  code: text().notNull().unique(),
  module: text().notNull(),
  description: text().notNull(),
});

export const roles = pgTable(
  'roles',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    code: text().notNull(),
    name: text().notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    unique('roles_institute_code').on(t.instituteId, t.code),
    // Target for composite foreign keys that pin child rows to the role's own institute.
    unique('roles_id_institute').on(t.id, t.instituteId),
  ],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id').notNull(),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    // Denormalised tenant key so the RLS policy is the same simple check as every other table.
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionId] }),
    sameInstituteRole('role_permissions_role_fk', t.roleId, t.instituteId),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').notNull(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    // Narrows a role, e.g. a teacher's sections; filled in by the academics module.
    scope: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    sameInstituteRole('user_roles_role_fk', t.roleId, t.instituteId),
    uniqueIndex('user_roles_user_role').on(t.userId, t.roleId),
    index('user_roles_institute_user').on(t.instituteId, t.userId),
  ],
);
