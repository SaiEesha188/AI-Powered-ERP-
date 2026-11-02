// Learning materials (M12): who may share, visibility by audience and section, batched notices.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp, uniquePhone } from './helpers.js';

let t: TestApp;
let school: Awaited<ReturnType<TestApp['setupSchool']>>;
let teacher: ReturnType<TestApp['as']>;
let otherTeacher: ReturnType<TestApp['as']>;
let maths: string;
let science: string;
let inA: Awaited<ReturnType<TestApp['admitStudent']>>;
let inB: Awaited<ReturnType<TestApp['admitStudent']>>;
let sharedLink: string;

const HOUR = 60 * 60 * 1000;

beforeAll(async () => {
  t = await createTestApp();
  school = await t.setupSchool();
  maths = (await school.admin.post('/subjects', { name: 'Maths', code: 'MATH' }).expect(201)).body.id;
  science = (await school.admin.post('/subjects', { name: 'Science', code: 'SCI' }).expect(201)).body.id;
  await school.admin.put(`/classes/${school.classId}/subjects`, { subjects: [{ subjectId: maths }, { subjectId: science }] }).expect(200);
  const phone = uniquePhone();
  const staff = await school.admin.post('/staff', { name: 'Maths Teacher', phone, designation: 'TGT' }).expect(201);
  await school.admin.post(`/sections/${school.sectionA}/assignments`, { staffId: staff.body.id, subjectId: maths }).expect(201);
  teacher = t.as((await t.login(phone)).accessToken, school.instituteId);
  const otherPhone = uniquePhone();
  await school.admin.post('/staff', { name: 'Other', phone: otherPhone, designation: 'TGT' }).expect(201);
  otherTeacher = t.as((await t.login(otherPhone)).accessToken, school.instituteId);
  inA = await t.admitStudent(school.admin, { name: 'In A', sectionId: school.sectionA });
  inB = await t.admitStudent(school.admin, { name: 'In B', sectionId: school.sectionB });
});
afterAll(() => t.close());

describe('sharing (MAT-01, MAT-02)', () => {
  it('lets a teacher share links and files for a subject they teach', async () => {
    const link = await teacher
      .post('/materials', { classId: school.classId, subjectId: maths, chapter: 'Fractions', title: 'Fractions explained', type: 'link', url: 'https://example.com/fractions' })
      .expect(201);
    sharedLink = link.body.id;
    expect(link.body).toMatchObject({ subjectName: 'Maths', chapter: 'Fractions', audience: 'everyone', sectionIds: [], file: null });

    const upload = await teacher.upload('/files', Buffer.from('%PDF-1.4 fractions'), 'fractions.pdf').expect(201);
    const file = await teacher
      .post('/materials', { classId: school.classId, subjectId: maths, chapter: 'Fractions', title: 'Worksheet', type: 'file', fileId: upload.body.id, sectionIds: [school.sectionA] })
      .expect(201);
    expect(file.body.file.url).toContain('sig=');
    await teacher.post('/materials', { classId: school.classId, subjectId: maths, title: 'Answer key', type: 'link', url: 'https://example.com/key', audience: 'staff' }).expect(201);
  });

  it('refuses subjects the teacher does not teach and malformed input', async () => {
    await teacher.post('/materials', { classId: school.classId, subjectId: science, title: 'Cells', type: 'link', url: 'https://example.com/cells' }).expect(403);
    await otherTeacher.post('/materials', { classId: school.classId, subjectId: maths, title: 'Not mine', type: 'link', url: 'https://example.com/x' }).expect(403);
    await teacher.post('/materials', { classId: school.classId, subjectId: maths, title: 'No url', type: 'link' }).expect(400);
    // The office can share for any class and subject.
    await school.admin.post('/materials', { classId: school.classId, subjectId: science, title: 'Lab rules', type: 'link', url: 'https://example.com/lab' }).expect(201);
  });

  it('lets only the sharer (or the office) change it', async () => {
    await otherTeacher.patch(`/materials/${sharedLink}`, { title: 'Hijacked' }).expect(403);
    const res = await teacher.patch(`/materials/${sharedLink}`, { title: 'Fractions, explained' }).expect(200);
    expect(res.body.title).toBe('Fractions, explained');
    const list = await teacher.get(`/materials?subjectId=${maths}`).expect(200);
    expect(list.body.map((m: { title: string }) => m.title).sort()).toEqual(['Answer key', 'Fractions, explained', 'Worksheet']);
  });
});

describe('what families see', () => {
  it('hides staff-only material and material limited to other sections', async () => {
    const parentA = t.as((await t.login(inA.guardianPhone)).accessToken, school.instituteId);
    const parentB = t.as((await t.login(inB.guardianPhone)).accessToken, school.instituteId);
    const a = await parentA.get(`/family/children/${inA.id}/materials`).expect(200);
    expect(a.body.map((m: { title: string }) => m.title).sort()).toEqual(['Fractions, explained', 'Lab rules', 'Worksheet']);
    const b = await parentB.get(`/family/children/${inB.id}/materials?subjectId=${maths}`).expect(200);
    expect(b.body.map((m: { title: string }) => m.title)).toEqual(['Fractions, explained']);
    await parentA.get(`/family/children/${inB.id}/materials`).expect(404);
    await parentA.get('/materials').expect(403);
  });

  it('batches new-material notices into one daily message per child (MAT-04)', async () => {
    const now = new Date();
    await t.runNotifications(now);
    expect(t.whatsapp.sent.filter((m) => m.template === 'material_digest_v1')).toEqual([]);
    await t.runNotifications(new Date(now.getTime() + 25 * HOUR));
    const forA = t.whatsapp.to(inA.guardianPhone).filter((m) => m.template === 'material_digest_v1');
    expect(forA).toHaveLength(1);
    expect(forA[0]!.params[1]).toContain('Worksheet');
    expect(forA[0]!.params[1]).not.toContain('Answer key');
    const forB = t.whatsapp.to(inB.guardianPhone).filter((m) => m.template === 'material_digest_v1');
    expect(forB[0]!.params[1]).not.toContain('Worksheet');
  });
});
