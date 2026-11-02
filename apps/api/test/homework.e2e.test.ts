// Homework (M11) and signed file links: scope, holidays, digest, completion, parent view.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, localDate } from '../src/common/institute.js';
import { createTestApp, type TestApp, uniquePhone } from './helpers.js';

let t: TestApp;
let school: Awaited<ReturnType<TestApp['setupSchool']>>;
let mathsTeacher: ReturnType<TestApp['as']>;
let classTeacherB: ReturnType<TestApp['as']>;
let otherTeacher: ReturnType<TestApp['as']>;
let maths: string;
let science: string;
let riya: Awaited<ReturnType<TestApp['admitStudent']>>;
let kabir: { id: string; guardianPhone: string };
let zoe: Awaited<ReturnType<TestApp['admitStudent']>>;
let pdf: { id: string; url: string };
let firstHomework: string;

const today = localDate('Asia/Kolkata');
const HOUR = 60 * 60 * 1000;

async function staffMember(name: string) {
  const phone = uniquePhone();
  const res = await school.admin.post('/staff', { name, phone, designation: 'TGT' }).expect(201);
  return { id: res.body.id as string, api: t.as((await t.login(phone)).accessToken, school.instituteId) };
}

beforeAll(async () => {
  t = await createTestApp();
  school = await t.setupSchool();
  await school.admin.patch('/institute', { workingDays: [1, 2, 3, 4, 5, 6, 7] }).expect(200);
  maths = (await school.admin.post('/subjects', { name: 'Maths', code: 'MATH' }).expect(201)).body.id;
  science = (await school.admin.post('/subjects', { name: 'Science', code: 'SCI' }).expect(201)).body.id;
  await school.admin.put(`/classes/${school.classId}/subjects`, { subjects: [{ subjectId: maths }, { subjectId: science }] }).expect(200);

  const mt = await staffMember('Maths Teacher');
  await school.admin.post(`/sections/${school.sectionA}/assignments`, { staffId: mt.id, subjectId: maths }).expect(201);
  mathsTeacher = mt.api;
  const ct = await staffMember('Class Teacher B');
  await school.admin.patch(`/sections/${school.sectionB}`, { classTeacherId: ct.id }).expect(200);
  classTeacherB = ct.api;
  otherTeacher = (await staffMember('Other Teacher')).api;

  riya = await t.admitStudent(school.admin, { name: 'Riya', sectionId: school.sectionA });
  const kabirPhone = uniquePhone();
  const k = await school.admin
    .post('/students', { name: 'Kabir', sectionId: school.sectionA, guardians: [{ name: 'Kabir Parent', phone: kabirPhone, relation: 'father' }] })
    .expect(201);
  kabir = { id: k.body.id, guardianPhone: kabirPhone };
  zoe = await t.admitStudent(school.admin, { name: 'Zoe', sectionId: school.sectionB });
});
afterAll(() => t.close());

describe('files and signed links', () => {
  it('uploads an allowed file and serves it through a signed link', async () => {
    const res = await mathsTeacher.upload('/files', Buffer.from('%PDF-1.4 worksheet'), 'worksheet.pdf').expect(201);
    pdf = res.body;
    expect(res.body).toMatchObject({ name: 'worksheet.pdf', mime: 'application/pdf' });
    const url = new URL(pdf.url);
    const got = await t.http.get(`${url.pathname}${url.search}`).expect(200);
    expect(got.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(got.body).toString()).toContain('worksheet');
  });

  it('refuses tampered or expired links', async () => {
    const url = new URL(pdf.url);
    const sig = url.searchParams.get('sig')!;
    await t.http.get(`${url.pathname}?exp=${url.searchParams.get('exp')}&sig=${sig.slice(0, -2)}xx`).expect(403);
    await t.http.get(`${url.pathname}?exp=${Number(url.searchParams.get('exp')) + 60}&sig=${sig}`).expect(403);
    await t.http.get(`${url.pathname}?exp=1000&sig=${sig}`).expect(403);
  });

  it('refuses disallowed types and uploads from families', async () => {
    await mathsTeacher.upload('/files', Buffer.from('MZ'), 'virus.exe').expect(400);
    await mathsTeacher.upload('/files', Buffer.from('%PDF'), 'fake.png').expect(400);
    const { accessToken } = await t.login(riya.guardianPhone);
    await t.as(accessToken, school.instituteId).upload('/files', Buffer.from('%PDF-1.4'), 'a.pdf').expect(403);
  });
});

describe('posting homework (HW-01, HW-02, BR-04)', () => {
  it('refuses sections the teacher does not teach, creating nothing', async () => {
    await mathsTeacher
      .post('/homework', { sectionIds: [school.sectionA, school.sectionB], subjectId: maths, title: 'Ex 1', dueDate: addDays(today, 1) })
      .expect(403);
    expect((await school.admin.get('/homework').expect(200)).body).toEqual([]);
    await otherTeacher.post('/homework', { sectionIds: [school.sectionA], subjectId: maths, title: 'Ex 1', dueDate: addDays(today, 1) }).expect(403);
  });

  it('lets a subject teacher and a class teacher post, with attachments and links', async () => {
    const res = await mathsTeacher
      .post('/homework', {
        sectionIds: [school.sectionA],
        subjectId: maths,
        title: 'Exercise 3.2',
        instructions: 'Questions 1 to 10',
        dueDate: addDays(today, 1),
        links: [{ url: 'https://example.com/video', label: 'Lesson video' }],
        fileIds: [pdf.id],
      })
      .expect(201);
    firstHomework = res.body[0].id;
    expect(res.body[0]).toMatchObject({ dueDate: addDays(today, 1), dueDateShifted: false });
    // A class teacher may post any subject for their own section.
    await classTeacherB.post('/homework', { sectionIds: [school.sectionB], subjectId: science, title: 'Plant cell diagram', dueDate: addDays(today, 2) }).expect(201);

    const list = await mathsTeacher.get(`/homework?sectionId=${school.sectionA}`).expect(200);
    expect(list.body[0]).toMatchObject({ title: 'Exercise 3.2', subjectName: 'Maths', teacherName: 'Maths Teacher', links: [{ label: 'Lesson video' }] });
    expect(list.body[0].attachments[0].url).toContain('/files/');
  });

  it('moves a due date that falls on a holiday (BR-10)', async () => {
    await school.admin.post('/calendar/events', { type: 'holiday', title: 'Festival', startDate: addDays(today, 3), endDate: addDays(today, 3) }).expect(201);
    const res = await mathsTeacher.post('/homework', { sectionIds: [school.sectionA], subjectId: maths, title: 'Exercise 3.3', dueDate: addDays(today, 3) }).expect(201);
    expect(res.body[0]).toMatchObject({ dueDate: addDays(today, 4), dueDateShifted: true });
    await mathsTeacher.post('/homework', { sectionIds: [school.sectionA], subjectId: maths, title: 'Old', dueDate: addDays(today, -1) }).expect(400);
  });

  it('moves existing homework when a holiday is declared later', async () => {
    const res = await mathsTeacher.post('/homework', { sectionIds: [school.sectionA], subjectId: maths, title: 'Project', dueDate: addDays(today, 6) }).expect(201);
    await school.admin.post('/calendar/events', { type: 'holiday', title: 'Rain', startDate: addDays(today, 6), endDate: addDays(today, 6) }).expect(201);
    const detail = await mathsTeacher.get(`/homework/${res.body[0].id}`).expect(200);
    expect(detail.body.dueDate).toBe(addDays(today, 7));
  });
});

describe('daily digest (HW-03, BR-12)', () => {
  it("sends one digest per child at the institute's digest time", async () => {
    const now = new Date();
    await t.runNotifications(now);
    expect(t.whatsapp.sent.filter((m) => m.template === 'homework_digest_v1')).toEqual([]);

    await t.runNotifications(new Date(now.getTime() + 25 * HOUR));
    const digests = t.whatsapp.to(riya.guardianPhone).filter((m) => m.template === 'homework_digest_v1');
    expect(digests).toHaveLength(1);
    expect(digests[0]!.params[0]).toBe('Riya');
    expect(digests[0]!.params[1]).toMatch(/^1\) Maths: Exercise 3\.2 .*; 2\) Maths: Exercise 3\.3/);
    expect(t.sms.texts.filter((m) => m.phone === kabir.guardianPhone && m.text.includes('Exercise 3.2'))).toHaveLength(1);
    expect(t.whatsapp.to(zoe.guardianPhone).find((m) => m.template === 'homework_digest_v1')?.params[1]).toContain('Plant cell diagram');
  });

  it('sends urgent homework immediately and skips cancelled homework', async () => {
    await mathsTeacher.post('/homework', { sectionIds: [school.sectionA], subjectId: maths, title: 'Bring compass tomorrow', dueDate: addDays(today, 1), isUrgent: true }).expect(201);
    const cancelled = await mathsTeacher.post('/homework', { sectionIds: [school.sectionA], subjectId: maths, title: 'Withdrawn task', dueDate: addDays(today, 1) }).expect(201);
    await mathsTeacher.delete(`/homework/${cancelled.body[0].id}`).expect(204);
    const now = new Date();
    await t.runNotifications(now);
    expect(t.whatsapp.to(riya.guardianPhone).some((m) => m.params[1]?.includes('Bring compass'))).toBe(true);
    await t.runNotifications(new Date(now.getTime() + 25 * HOUR));
    expect(t.whatsapp.sent.some((m) => m.params.some((p) => p.includes('Withdrawn task')))).toBe(false);
  });
});

describe('completion (HW-05)', () => {
  it('records done, late and feedback for the section', async () => {
    await mathsTeacher
      .put(`/homework/${firstHomework}/completion`, { records: [{ studentId: riya.id, status: 'done', score: 9 }, { studentId: kabir.id, status: 'late', feedback: 'Q7 missing' }] })
      .expect(200);
    const detail = await mathsTeacher.get(`/homework/${firstHomework}`).expect(200);
    expect(detail.body.students.map((s: { name: string; status: string }) => `${s.name}:${s.status}`).sort()).toEqual(['Kabir:late', 'Riya:done']);
    const list = await mathsTeacher.get(`/homework?sectionId=${school.sectionA}`).expect(200);
    expect(list.body.find((h: { id: string }) => h.id === firstHomework).completion).toEqual({ done: 1, late: 1, pending: 0 });
  });

  it('refuses other teachers and students outside the section', async () => {
    await otherTeacher.put(`/homework/${firstHomework}/completion`, { records: [{ studentId: riya.id, status: 'done' }] }).expect(403);
    await mathsTeacher.put(`/homework/${firstHomework}/completion`, { records: [{ studentId: zoe.id, status: 'done' }] }).expect(400);
  });

  it('lets only the author edit or cancel', async () => {
    await otherTeacher.patch(`/homework/${firstHomework}`, { title: 'Hijack' }).expect(403);
    await classTeacherB.delete(`/homework/${firstHomework}`).expect(403);
    const res = await mathsTeacher.patch(`/homework/${firstHomework}`, { title: 'Exercise 3.2 (revised)' }).expect(200);
    expect(res.body.title).toBe('Exercise 3.2 (revised)');
    const mine = await mathsTeacher.get('/homework?mine=true').expect(200);
    expect(mine.body.every((h: { teacherName: string }) => h.teacherName === 'Maths Teacher')).toBe(true);
  });
});

describe('parent view', () => {
  it("shows a parent their child's homework with the teacher's mark", async () => {
    const { accessToken } = await t.login(riya.guardianPhone);
    const parent = t.as(accessToken, school.instituteId);
    const res = await parent.get(`/family/children/${riya.id}/homework?from=${today}&to=${addDays(today, 10)}`).expect(200);
    const first = res.body.find((h: { id: string }) => h.id === firstHomework);
    expect(first).toMatchObject({ completion: 'done', subjectName: 'Maths' });
    expect(first.attachments[0].url).toContain('sig=');
    expect(res.body.some((h: { title: string }) => h.title === 'Withdrawn task')).toBe(false);
    await parent.get(`/family/children/${zoe.id}/homework?from=${today}&to=${addDays(today, 10)}`).expect(404);
    await parent.get('/homework').expect(403);
  });
});
