// Staff (M06) and academic structure (M07): classes, subjects, sections and teacher assignments.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp, uniquePhone } from './helpers.js';

let t: TestApp;
let platformToken: string;
let tenant: Awaited<ReturnType<TestApp['createTenant']>>;
let admin: ReturnType<TestApp['as']>;

// Built up by the tests in order.
let teacher: { id: string; phone: string; token: string };
let otherTeacher: { id: string };
let class8: string;
let maths: string;
let science: string;
let art: string;
let section8A: string;

beforeAll(async () => {
  t = await createTestApp();
  platformToken = await t.platformAdmin();
  tenant = await t.createTenant(platformToken);
  admin = t.as(tenant.adminToken, tenant.instituteId);
  const year = await admin.post('/academic-years', { name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' }).expect(201);
  await admin.post(`/academic-years/${year.body.id}/make-current`).expect(200);
});
afterAll(() => t.close());

describe('staff (STF-01, STF-04)', () => {
  it('adds a teacher with a login, roles and a profile in one call', async () => {
    const phone = uniquePhone();
    const res = await admin
      .post('/staff', { name: 'Kavya Rao', phone, designation: 'TGT Mathematics', employeeCode: 'E001', joiningDate: '2024-06-01' })
      .expect(201);
    expect(res.body).toMatchObject({ name: 'Kavya Rao', designation: 'TGT Mathematics', status: 'active', roles: ['teacher'] });
    teacher = { id: res.body.id, phone, token: (await t.login(phone)).accessToken };

    const other = await admin
      .post('/staff', { name: 'Arjun Das', phone: uniquePhone(), designation: 'TGT Science', roles: ['teacher', 'class_teacher'] })
      .expect(201);
    otherTeacher = { id: other.body.id };
  });

  it('rejects duplicate employee codes and duplicate profiles', async () => {
    await admin.post('/staff', { name: 'Copy', phone: uniquePhone(), designation: 'Clerk', employeeCode: 'E001' }).expect(409);
    await admin.post('/staff', { name: 'Again', phone: teacher.phone, designation: 'Clerk' }).expect(409);
  });

  it('lists the directory with roles, and teachers cannot add staff', async () => {
    const res = await admin.get('/staff').expect(200);
    expect(res.body.map((s: { name: string }) => s.name)).toEqual(['Arjun Das', 'Kavya Rao']);
    expect(res.body[0].roles).toEqual(['class_teacher', 'teacher']);
    await t.as(teacher.token, tenant.instituteId).get('/staff').expect(200);
    await t.as(teacher.token, tenant.instituteId).post('/staff', { name: 'X', phone: uniquePhone(), designation: 'X' }).expect(403);
  });
});

describe('classes and subjects (ACA-01, ACA-02)', () => {
  it('creates classes and subjects', async () => {
    class8 = (await admin.post('/classes', { name: 'Class 8', level: 8 }).expect(201)).body.id;
    await admin.post('/classes', { name: 'Class 7', level: 7 }).expect(201);
    await admin.post('/classes', { name: 'Class 8', level: 8 }).expect(409);
    maths = (await admin.post('/subjects', { name: 'Mathematics', code: 'MATH' }).expect(201)).body.id;
    science = (await admin.post('/subjects', { name: 'Science', code: 'SCI' }).expect(201)).body.id;
    art = (await admin.post('/subjects', { name: 'Art', code: 'ART', type: 'co_scholastic' }).expect(201)).body.id;
    await admin.post('/subjects', { name: 'Maths again', code: 'MATH' }).expect(409);
  });

  it('maps subjects to a class and lists classes in level order', async () => {
    const res = await admin
      .put(`/classes/${class8}/subjects`, {
        subjects: [
          { subjectId: maths, periodsPerWeek: 6 },
          { subjectId: science, periodsPerWeek: 5 },
        ],
      })
      .expect(200);
    expect(res.body.subjects.map((s: { code: string }) => s.code)).toEqual(['MATH', 'SCI']);

    const list = await admin.get('/classes').expect(200);
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(['Class 7', 'Class 8']);
    await admin.put(`/classes/${class8}/subjects`, { subjects: [{ subjectId: maths }, { subjectId: maths }] }).expect(400);
  });

  it("refuses another institute's subject", async () => {
    const other = await t.createTenant(platformToken);
    const foreign = await t.as(other.adminToken, other.instituteId).post('/subjects', { name: 'Foreign', code: 'FOR' }).expect(201);
    await admin.put(`/classes/${class8}/subjects`, { subjects: [{ subjectId: foreign.body.id }] }).expect(400);
    // And the other institute sees none of this one's classes.
    const theirs = await t.as(other.adminToken, other.instituteId).get('/classes').expect(200);
    expect(theirs.body).toEqual([]);
  });
});

describe('sections and assignments (ACA-01, STF-02)', () => {
  it('creates a section in the current year with a class teacher', async () => {
    const res = await admin.post('/sections', { classId: class8, name: 'A', classTeacherId: otherTeacher.id }).expect(201);
    section8A = res.body.id;
    expect(res.body).toMatchObject({ className: 'Class 8', classTeacher: { id: otherTeacher.id, name: 'Arjun Das' } });
    await admin.post('/sections', { classId: class8, name: 'A' }).expect(409);
  });

  it('assigns a subject teacher only for subjects the class studies', async () => {
    await admin.post(`/sections/${section8A}/assignments`, { staffId: teacher.id, subjectId: maths }).expect(201);
    await admin.post(`/sections/${section8A}/assignments`, { staffId: teacher.id, subjectId: maths }).expect(409);
    await admin.post(`/sections/${section8A}/assignments`, { staffId: teacher.id, subjectId: art }).expect(400);
    await admin.post(`/sections/${section8A}/assignments`, { staffId: otherTeacher.id, subjectId: science }).expect(201);

    const list = await admin.get('/sections').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].assignments.map((a: { staffName: string; subjectName: string }) => `${a.subjectName}:${a.staffName}`)).toEqual([
      'Mathematics:Kavya Rao',
      'Science:Arjun Das',
    ]);
  });

  it('shows a teacher their own sections and subjects', async () => {
    const mine = await t.as(teacher.token, tenant.instituteId).get('/me/teaching').expect(200);
    expect(mine.body.sections).toEqual([
      { id: section8A, name: 'A', classId: class8, className: 'Class 8', isClassTeacher: false, mySubjects: [{ id: maths, name: 'Mathematics' }] },
    ]);
  });

  it('protects structure that is in use', async () => {
    // Removing Maths from Class 8 would orphan Kavya's assignment.
    await admin.put(`/classes/${class8}/subjects`, { subjects: [{ subjectId: science }] }).expect(409);
    await admin.delete(`/subjects/${maths}`).expect(409);
    await admin.delete(`/classes/${class8}`).expect(409);
    // A teacher with sections cannot be marked as left until they are reassigned.
    await admin.patch(`/staff/${teacher.id}`, { status: 'left' }).expect(409);
  });

  it('frees a teacher once their assignments are removed', async () => {
    const section = (await admin.get('/sections').expect(200)).body[0];
    const kavya = section.assignments.find((a: { staffId: string }) => a.staffId === teacher.id);
    await admin.delete(`/sections/${section8A}/assignments/${kavya.id}`).expect(204);
    await admin.patch(`/staff/${teacher.id}`, { status: 'left' }).expect(200);
    // Leavers cannot be given new work.
    await admin.post(`/sections/${section8A}/assignments`, { staffId: teacher.id, subjectId: maths }).expect(400);
    await admin.patch(`/sections/${section8A}`, { classTeacherId: teacher.id }).expect(400);
  });

  it('teachers can view the structure but not change it', async () => {
    const asTeacher = t.as(teacher.token, tenant.instituteId);
    await asTeacher.get('/sections').expect(200);
    await asTeacher.post('/classes', { name: 'Class 9', level: 9 }).expect(403);
    await asTeacher.post(`/sections/${section8A}/assignments`, { staffId: otherTeacher.id, subjectId: maths }).expect(403);
  });

  it('records the changes in the audit log', async () => {
    const owner = await t.addMember(tenant.adminToken, tenant.instituteId, ['principal']);
    const res = await t.as(owner.token, tenant.instituteId).get('/audit-logs?limit=200').expect(200);
    expect(res.body.map((e: { action: string }) => e.action)).toEqual(
      expect.arrayContaining(['staff.create', 'class.create', 'class.subjects.set', 'section.create', 'assignment.create', 'assignment.delete', 'staff.update']),
    );
  });
});
