// Isolation between institutes, tested both through the API and directly against Postgres
// as the erp_app role, so the database enforces it even if application code has a bug.
import { academicYears, auditLogs, createDb, type Db, eq, roles, sql, userRoles, users, withTenant } from '@erp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let appDb: Db;
let closeAppDb: () => Promise<void>;
let platformToken: string;
let a: Awaited<ReturnType<TestApp['createTenant']>>;
let b: Awaited<ReturnType<TestApp['createTenant']>>;

beforeAll(async () => {
  t = await createTestApp();
  const conn = createDb(t.env.DATABASE_URL!, { max: 2 });
  appDb = conn.db;
  closeAppDb = () => conn.pool.end();
  platformToken = await t.platformAdmin();
  a = await t.createTenant(platformToken);
  b = await t.createTenant(platformToken, { vertical: 'coaching' });
  await t.as(a.adminToken, a.instituteId)
    .post('/academic-years', { name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' })
    .expect(201);
});
afterAll(async () => {
  await closeAppDb();
  await t.close();
});

/** Postgres error code from a failed query (drizzle wraps the driver error). */
async function pgError(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (e: any) {
    return e.code ?? e.cause?.code;
  }
  return undefined;
}

describe('platform provisioning', () => {
  it('only the platform team can create tenants', async () => {
    const body = {
      organization: { name: 'X', type: 'trust' },
      institute: { name: 'X School', vertical: 'school', subdomain: 'x-school' },
      planCode: 'standard',
      seats: 10,
      admin: { name: 'X', phone: '+919999999999' },
    };
    await t.as(a.adminToken).post('/platform/tenants', body).expect(403);
  });

  it('applies the vertical pack and creates the system roles', async () => {
    const inst = await t.as(b.adminToken, b.instituteId).get('/institute').expect(200);
    expect(inst.body.settings.terminology).toMatchObject({ class: 'Course', section: 'Batch', homework: 'Assignment' });
    const roleList = await t.as(b.adminToken, b.instituteId).get('/roles').expect(200);
    expect(roleList.body.map((r: { code: string }) => r.code).sort()).toEqual(
      ['accountant', 'admin', 'class_teacher', 'management', 'parent', 'principal', 'student', 'teacher'].sort(),
    );
  });

  it('rejects a duplicate subdomain', async () => {
    const inst = await t.as(a.adminToken, a.instituteId).get('/institute').expect(200);
    const res = await t.as(platformToken).post('/platform/tenants', {
      organization: { name: 'Dup', type: 'trust' },
      institute: { name: 'Dup', vertical: 'school', subdomain: inst.body.subdomain },
      planCode: 'standard',
      seats: 10,
      admin: { name: 'Dup', phone: '+919999999998' },
    });
    expect(res.status).toBe(409);
  });
});

describe('API isolation', () => {
  it('refuses an institute the caller does not belong to', async () => {
    await t.as(a.adminToken, b.instituteId).get('/academic-years').expect(403);
    await t.as(a.adminToken, '00000000-0000-4000-8000-000000000000').get('/academic-years').expect(403);
  });

  it("does not show one institute's data to another", async () => {
    const res = await t.as(b.adminToken, b.instituteId).get('/academic-years').expect(200);
    expect(res.body).toEqual([]);
  });

  it("cannot reach another institute's record by id", async () => {
    const years = await t.as(a.adminToken, a.instituteId).get('/academic-years').expect(200);
    const yearA = years.body[0].id;
    await t.as(b.adminToken, b.instituteId).post(`/academic-years/${yearA}/make-current`).expect(404);
  });

  it('reuses one identity across institutes and keeps member lists separate (USR-01)', async () => {
    // Institute B hires institute A's admin as a teacher.
    const res = await t.as(b.adminToken, b.instituteId)
      .post('/users', { name: 'Someone Else', phone: a.adminPhone, roles: ['teacher'] })
      .expect(201);
    expect(res.body.userId).toBe(a.adminUserId);

    const me = await t.as(a.adminToken).get('/me').expect(200);
    expect(me.body.memberships.map((m: { instituteId: string }) => m.instituteId).sort()).toEqual(
      [a.instituteId, b.instituteId].sort(),
    );
    // The existing name is kept rather than overwritten by another institute.
    expect(me.body.user.name).toBe('Admin');

    const membersOfB = await t.as(b.adminToken, b.instituteId).get('/users').expect(200);
    const sameUser = membersOfB.body.find((u: { id: string }) => u.id === a.adminUserId);
    expect(sameUser.roles).toEqual([{ code: 'teacher', name: 'Teacher' }]);
  });
});

describe('database-level isolation (erp_app role)', () => {
  it('shows no tenant rows when no tenant is set', async () => {
    expect(await appDb.select().from(academicYears)).toEqual([]);
    expect(await appDb.select().from(roles)).toEqual([]);
  });

  it("shows only the current tenant's rows", async () => {
    const rows = await withTenant(appDb, { instituteId: b.instituteId, userId: b.adminUserId }, (tx) =>
      tx.select().from(academicYears),
    );
    expect(rows).toEqual([]);
    const own = await withTenant(appDb, { instituteId: a.instituteId, userId: a.adminUserId }, (tx) =>
      tx.select().from(academicYears),
    );
    expect(own).toHaveLength(1);
  });

  it('refuses writes into another tenant', async () => {
    const code = await pgError(
      withTenant(appDb, { instituteId: a.instituteId, userId: a.adminUserId }, (tx) =>
        tx.insert(academicYears).values({ instituteId: b.instituteId, name: 'sneaky', startDate: '2026-01-01', endDate: '2026-12-31' }),
      ),
    );
    expect(code).toBe('42501');
  });

  it("cannot link a user to another institute's role (composite foreign key)", async () => {
    const [roleOfB] = await t.system.select({ id: roles.id }).from(roles).where(eq(roles.instituteId, b.instituteId)).limit(1);
    const code = await pgError(
      withTenant(appDb, { instituteId: a.instituteId, userId: a.adminUserId }, (tx) =>
        tx.insert(userRoles).values({ userId: a.adminUserId, roleId: roleOfB!.id, instituteId: a.instituteId }),
      ),
    );
    expect(code).toBe('23503');
  });

  it('keeps privilege columns and system tables out of reach', async () => {
    const ctx = { instituteId: a.instituteId, userId: a.adminUserId };
    expect(await pgError(withTenant(appDb, ctx, (tx) => tx.update(users).set({ isPlatformAdmin: true })))).toBe('42501');
    expect(await pgError(withTenant(appDb, ctx, (tx) => tx.execute(sql`select * from otp_codes`)))).toBe('42501');
    expect(await pgError(withTenant(appDb, ctx, (tx) => tx.execute(sql`select * from sessions`)))).toBe('42501');
  });

  it('keeps the audit log append-only', async () => {
    const ctx = { instituteId: a.instituteId, userId: a.adminUserId };
    expect(await pgError(withTenant(appDb, ctx, (tx) => tx.update(auditLogs).set({ action: 'tampered' })))).toBe('42501');
    expect(await pgError(withTenant(appDb, ctx, (tx) => tx.delete(auditLogs)))).toBe('42501');
    expect(await pgError(t.system.delete(auditLogs))).toBe('42501');
  });

  it('has RLS and a policy on every table that carries institute_id', async () => {
    const res = await t.system.execute(sql`
      select c.relname as table, c.relrowsecurity as rls,
             (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
      from pg_class c
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'institute_id' and not a.attisdropped
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'`);
    const unprotected = res.rows.filter((r: any) => !r.rls || r.policies === 0);
    expect(res.rows.length).toBeGreaterThan(5);
    expect(unprotected).toEqual([]);
  });
});
