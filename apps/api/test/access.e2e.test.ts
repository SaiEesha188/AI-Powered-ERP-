// Permissions, custom roles, institute settings, academic calendar and audit trail.
import { assignRole, findOrCreateUserByPhone } from '@erp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp, uniquePhone } from './helpers.js';

let t: TestApp;
let tenant: Awaited<ReturnType<TestApp['createTenant']>>;
let admin: ReturnType<TestApp['as']>;
let teacher: { userId: string; token: string };
let principal: { userId: string; token: string };

beforeAll(async () => {
  t = await createTestApp();
  tenant = await t.createTenant(await t.platformAdmin());
  admin = t.as(tenant.adminToken, tenant.instituteId);
  teacher = await t.addMember(tenant.adminToken, tenant.instituteId, ['teacher']);
  principal = await t.addMember(tenant.adminToken, tenant.instituteId, ['principal']);
});
afterAll(() => t.close());

describe('permission checks', () => {
  it('requires the institute header on tenant routes', async () => {
    await t.as(tenant.adminToken).get('/academic-years').expect(400);
  });

  it('lets a teacher read the calendar but not change it', async () => {
    const asTeacher = t.as(teacher.token, tenant.instituteId);
    await asTeacher.get('/academic-years').expect(200);
    await asTeacher.post('/academic-years', { name: '2030-31', startDate: '2030-04-01', endDate: '2031-03-31' }).expect(403);
    await asTeacher.patch('/institute', { name: 'Hijacked' }).expect(403);
  });

  it('returns the caller permissions with /me when an institute is named', async () => {
    const me = await t.as(teacher.token, tenant.instituteId).get('/me').expect(200);
    expect(me.body.permissions).toContain('attendance.mark');
    expect(me.body.permissions).not.toContain('calendar.manage');
  });
});

describe('academic years and terms (CAL-01)', () => {
  let yearId: string;

  it('creates a year and validates dates', async () => {
    const res = await admin.post('/academic-years', { name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' }).expect(201);
    yearId = res.body.id;
    expect(res.body.isCurrent).toBe(false);
    await admin.post('/academic-years', { name: 'Bad', startDate: '2027-04-01', endDate: '2027-01-01' }).expect(400);
    await admin.post('/academic-years', { name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' }).expect(409);
  });

  it('keeps exactly one current year', async () => {
    const next = await admin.post('/academic-years', { name: '2027-28', startDate: '2027-04-01', endDate: '2028-03-31' }).expect(201);
    await admin.post(`/academic-years/${yearId}/make-current`).expect(200);
    await admin.post(`/academic-years/${next.body.id}/make-current`).expect(200);
    const years = await admin.get('/academic-years').expect(200);
    expect(years.body.filter((y: { isCurrent: boolean }) => y.isCurrent).map((y: { id: string }) => y.id)).toEqual([next.body.id]);
  });

  it('adds terms inside the year, in sequence, without overlaps', async () => {
    const t1 = await admin.post(`/academic-years/${yearId}/terms`, { name: 'Term 1', startDate: '2026-04-01', endDate: '2026-09-30' }).expect(201);
    const t2 = await admin.post(`/academic-years/${yearId}/terms`, { name: 'Term 2', startDate: '2026-10-01', endDate: '2027-03-31' }).expect(201);
    expect([t1.body.seq, t2.body.seq]).toEqual([1, 2]);
    await admin.post(`/academic-years/${yearId}/terms`, { name: 'Overlap', startDate: '2026-09-01', endDate: '2026-10-15' }).expect(409);
    await admin.post(`/academic-years/${yearId}/terms`, { name: 'Outside', startDate: '2027-03-01', endDate: '2027-05-01' }).expect(400);
    // Shrinking the year so a term falls outside it is refused.
    await admin.patch(`/academic-years/${yearId}`, { name: '2026-27', startDate: '2026-04-01', endDate: '2027-01-31' }).expect(400);
  });
});

describe('institute settings (CFG-02, CFG-05)', () => {
  it('merges terminology and branding instead of replacing them', async () => {
    await admin.patch('/institute', { terminology: { homework: 'Home Task' }, branding: { primaryColor: '#123456' } }).expect(200);
    const res = await admin.patch('/institute', { branding: { whatsappSenderName: 'Demo School' } }).expect(200);
    expect(res.body.settings.terminology).toMatchObject({ homework: 'Home Task', class: 'Class' });
    expect(res.body.settings.branding).toEqual({ primaryColor: '#123456', whatsappSenderName: 'Demo School' });
    await admin.patch('/institute', { branding: { primaryColor: 'red' } }).expect(400);
  });
});

describe('custom roles (USR-03)', () => {
  it('grants permissions through a custom role', async () => {
    await admin
      .post('/roles', { code: 'calendar_clerk', name: 'Calendar Clerk', permissions: ['calendar.view', 'calendar.manage'] })
      .expect(201);
    const clerk = await t.addMember(tenant.adminToken, tenant.instituteId, ['calendar_clerk']);
    await t.as(clerk.token, tenant.instituteId)
      .post('/academic-years', { name: '2031-32', startDate: '2031-04-01', endDate: '2032-03-31' })
      .expect(201);
    await t.as(clerk.token, tenant.instituteId).get('/users').expect(403);
  });

  it('refuses to create a role with permissions the creator lacks', async () => {
    // The admin role does not include audit.view.
    const res = await admin.post('/roles', { code: 'snoop', name: 'Snoop', permissions: ['audit.view'] }).expect(403);
    expect(res.body.message).toMatch(/audit\.view/);
  });

  it('protects system roles', async () => {
    const roleList = await admin.get('/roles').expect(200);
    const teacherRole = roleList.body.find((r: { code: string }) => r.code === 'teacher');
    await admin.put(`/roles/${teacherRole.id}/permissions`, { permissions: [] }).expect(403);
    await admin.delete(`/roles/${teacherRole.id}`).expect(403);
  });

  it('lets only management grant the management role', async () => {
    await admin.post('/users', { name: 'Wannabe', phone: uniquePhone(), roles: ['management'] }).expect(403);

    const ownerPhone = uniquePhone();
    const owner = await findOrCreateUserByPhone(t.system, { phone: ownerPhone, name: 'Owner' });
    await assignRole(t.system, { instituteId: tenant.instituteId, userId: owner.id, roleCode: 'management' });
    const { accessToken } = await t.login(ownerPhone);
    await t.as(accessToken, tenant.instituteId)
      .post('/users', { name: 'Co-owner', phone: uniquePhone(), roles: ['management'] })
      .expect(201);
  });

  it('removes a role and the permission goes with it', async () => {
    const member = await t.addMember(tenant.adminToken, tenant.instituteId, ['teacher', 'accountant']);
    await t.as(member.token, tenant.instituteId).get('/academic-years').expect(200);
    await admin.delete(`/users/${member.userId}/roles/teacher`).expect(204);
    await admin.delete(`/users/${member.userId}/roles/teacher`).expect(404);
    await admin.delete(`/users/${tenant.adminUserId}/roles/admin`).expect(403);
  });
});

describe('audit log (USR-08)', () => {
  it('records changes with before and after, visible to the principal only', async () => {
    await admin.patch('/institute', { name: 'Renamed School' }).expect(200);
    await t.as(tenant.adminToken, tenant.instituteId).get('/audit-logs').expect(403);

    const res = await t.as(principal.token, tenant.instituteId).get('/audit-logs?entity=institute').expect(200);
    const rename = res.body.find((e: { after: { name?: string } }) => e.after?.name === 'Renamed School');
    expect(rename).toMatchObject({ action: 'institute.update', actorId: tenant.adminUserId, instituteId: tenant.instituteId });
    expect(rename.before.name).not.toBe('Renamed School');

    const all = await t.as(principal.token, tenant.instituteId).get('/audit-logs?limit=200').expect(200);
    expect(all.body.every((e: { instituteId: string }) => e.instituteId === tenant.instituteId)).toBe(true);
    expect(all.body.map((e: { action: string }) => e.action)).toEqual(
      expect.arrayContaining(['tenant.create', 'user.add', 'role.create', 'academic_year.create', 'term.create']),
    );
  });
});
