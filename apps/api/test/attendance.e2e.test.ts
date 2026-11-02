// Student attendance (M08): scope, holidays, edit window, offline sync, reports, parent view.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, localDate } from '../src/common/institute.js';
import { createTestApp, type TestApp, uniquePhone } from './helpers.js';

let t: TestApp;
let school: Awaited<ReturnType<TestApp['setupSchool']>>;
let classTeacher: ReturnType<TestApp['as']>;
let otherTeacher: ReturnType<TestApp['as']>;
let riya: Awaited<ReturnType<TestApp['admitStudent']>>;
let kabir: Awaited<ReturnType<TestApp['admitStudent']>>;
let meera: Awaited<ReturnType<TestApp['admitStudent']>>;
let inB: Awaited<ReturnType<TestApp['admitStudent']>>;

const today = localDate('Asia/Kolkata');
const yesterday = addDays(today, -1);
const twoDaysAgo = addDays(today, -2);
const holiday = addDays(today, -3);
/** 09:00 India time on a date, as an ISO instant. */
const morningOf = (date: string) => `${date}T09:00:00+05:30`;

beforeAll(async () => {
  t = await createTestApp();
  school = await t.setupSchool();
  // Every day is a working day so the test does not depend on today's weekday.
  await school.admin.patch('/institute', { workingDays: [1, 2, 3, 4, 5, 6, 7] }).expect(200);

  const ct = await school.admin.post('/staff', { name: 'Class Teacher', phone: uniquePhone(), designation: 'TGT' }).expect(201);
  await school.admin.patch(`/sections/${school.sectionA}`, { classTeacherId: ct.body.id }).expect(200);
  const other = await school.admin.post('/staff', { name: 'Other Teacher', phone: uniquePhone(), designation: 'TGT' }).expect(201);
  const login = async (phone: string) => t.as((await t.login(phone)).accessToken, school.instituteId);
  const staffList = (await school.admin.get('/staff').expect(200)).body as { id: string; phone: string }[];
  classTeacher = await login(staffList.find((s) => s.id === ct.body.id)!.phone);
  otherTeacher = await login(staffList.find((s) => s.id === other.body.id)!.phone);

  riya = await t.admitStudent(school.admin, { name: 'Riya', sectionId: school.sectionA, rollNo: 1 });
  kabir = await t.admitStudent(school.admin, { name: 'Kabir', sectionId: school.sectionA, rollNo: 2 });
  meera = await t.admitStudent(school.admin, { name: 'Meera', sectionId: school.sectionA, rollNo: 3 });
  inB = await t.admitStudent(school.admin, { name: 'In B', sectionId: school.sectionB });
  await school.admin.post('/calendar/events', { type: 'holiday', title: 'Local holiday', startDate: holiday, endDate: holiday }).expect(201);
});
afterAll(() => t.close());

describe('marking (ATT-01, ATT-02)', () => {
  it('shows the register with everyone present by default', async () => {
    const res = await classTeacher.get(`/attendance/sections/${school.sectionA}?date=${today}`).expect(200);
    expect(res.body).toMatchObject({ marked: false, canEdit: true, day: { working: true } });
    expect(res.body.students.map((s: { name: string; status: string }) => `${s.name}:${s.status}`)).toEqual(['Riya:present', 'Kabir:present', 'Meera:present']);
  });

  it('saves exceptions and marks everyone else present', async () => {
    const res = await classTeacher
      .put(`/attendance/sections/${school.sectionA}`, { date: today, records: [{ studentId: kabir.id, status: 'absent' }, { studentId: meera.id, status: 'late', remark: 'Bus' }] })
      .expect(200);
    expect(res.body.marked).toBe(true);
    expect(res.body.newlyAbsent).toEqual([kabir.id]);
    expect(res.body.students.map((s: { name: string; status: string }) => `${s.name}:${s.status}`)).toEqual(['Riya:present', 'Kabir:absent', 'Meera:late']);
  });

  it('is idempotent and reports only newly absent students', async () => {
    const res = await classTeacher
      .put(`/attendance/sections/${school.sectionA}`, { date: today, records: [{ studentId: kabir.id, status: 'absent' }, { studentId: riya.id, status: 'absent' }] })
      .expect(200);
    expect(res.body.newlyAbsent).toEqual([riya.id]);
    // Meera was late; leaving her out of the exceptions sets her back to present.
    expect(res.body.students.find((s: { name: string }) => s.name === 'Meera').status).toBe('present');
  });

  it('rejects students from other sections', async () => {
    await classTeacher.put(`/attendance/sections/${school.sectionA}`, { date: today, records: [{ studentId: inB.id, status: 'absent' }] }).expect(400);
  });
});

describe('who can mark (BR-04)', () => {
  it('lets a teacher view but not mark a section they do not teach', async () => {
    const view = await otherTeacher.get(`/attendance/sections/${school.sectionA}?date=${today}`).expect(200);
    expect(view.body.canEdit).toBe(false);
    await otherTeacher.put(`/attendance/sections/${school.sectionA}`, { date: today, records: [] }).expect(403);
  });

  it('lets a subject teacher of the section mark it', async () => {
    const subject = await school.admin.post('/subjects', { name: 'Maths', code: 'M' }).expect(201);
    await school.admin.put(`/classes/${school.classId}/subjects`, { subjects: [{ subjectId: subject.body.id }] }).expect(200);
    const staffList = (await school.admin.get('/staff').expect(200)).body as { id: string; name: string }[];
    const other = staffList.find((s) => s.name === 'Other Teacher')!;
    await school.admin.post(`/sections/${school.sectionB}/assignments`, { staffId: other.id, subjectId: subject.body.id }).expect(201);
    await otherTeacher.put(`/attendance/sections/${school.sectionB}`, { date: today, records: [] }).expect(200);
  });

  it('keeps parents out', async () => {
    const { accessToken } = await t.login(riya.guardianPhone);
    await t.as(accessToken, school.instituteId).put(`/attendance/sections/${school.sectionA}`, { date: today, records: [] }).expect(403);
  });
});

describe('dates, holidays and the edit window (BR-01, BR-02, ATT-03, ATT-05)', () => {
  it('refuses future dates, dates outside the year and holidays', async () => {
    await classTeacher.put(`/attendance/sections/${school.sectionA}`, { date: addDays(today, 1), records: [] }).expect(400);
    await school.admin.put(`/attendance/sections/${school.sectionA}`, { date: addDays(today, -400), records: [], reason: 'Old' }).expect(400);
    const res = await school.admin.put(`/attendance/sections/${school.sectionA}`, { date: holiday, records: [], reason: 'Try' }).expect(409);
    expect(res.body.message).toContain('Local holiday');
  });

  it('accepts an offline capture synced the next day, but not a late edit', async () => {
    await classTeacher.put(`/attendance/sections/${school.sectionA}`, { date: yesterday, records: [{ studentId: riya.id, status: 'absent' }] }).expect(403);
    await classTeacher
      .put(`/attendance/sections/${school.sectionA}`, { date: yesterday, capturedAt: morningOf(yesterday), records: [{ studentId: riya.id, status: 'absent' }] })
      .expect(200);
    // A capture older than 48 hours cannot be synced by the teacher.
    await classTeacher
      .put(`/attendance/sections/${school.sectionA}`, { date: addDays(today, -4), capturedAt: morningOf(addDays(today, -4)), records: [] })
      .expect(400);
  });

  it('lets the office correct past days with a reason, and audits it', async () => {
    await school.admin.put(`/attendance/sections/${school.sectionA}`, { date: twoDaysAgo, records: [{ studentId: riya.id, status: 'absent' }] }).expect(400);
    await school.admin
      .put(`/attendance/sections/${school.sectionA}`, { date: twoDaysAgo, records: [{ studentId: riya.id, status: 'absent' }], reason: 'Register entered late' })
      .expect(200);
    const principal = await t.addMember(school.adminToken, school.instituteId, ['principal']);
    const log = await t.as(principal.token, school.instituteId).get('/audit-logs?entity=attendance_session&limit=50').expect(200);
    expect(log.body.some((e: { after: { reason: string } }) => e.after.reason === 'Register entered late')).toBe(true);
  });
});

describe('reports (ATT-07, ATT-08)', () => {
  it('summarises the day and lists sections not yet marked', async () => {
    await school.admin.post('/sections', { classId: school.classId, name: 'C' }).expect(201);
    const res = await school.admin.get(`/attendance/reports/daily?date=${today}`).expect(200);
    expect(res.body.totals).toMatchObject({ sections: 3, sectionsMarked: 2, absent: 2, present: 2 });
    expect(res.body.notMarked.map((s: { sectionName: string }) => s.sectionName)).toEqual(['C']);
    expect(typeof res.body.sections[0].markedOnTime).toBe('boolean');
  });

  it('builds the monthly register', async () => {
    const month = today.slice(0, 7);
    const res = await school.admin.get(`/attendance/reports/register/${school.sectionA}?month=${month}`).expect(200);
    const row = res.body.students.find((s: { name: string }) => s.name === 'Riya');
    expect(row.days[today]).toBe('A');
    expect(res.body.days[0]).toBe(`${month}-01`);
  });

  it('finds students below the threshold', async () => {
    const res = await school.admin.get(`/attendance/reports/defaulters?from=${twoDaysAgo}&to=${today}&threshold=75`).expect(200);
    const names = res.body.map((s: { name: string }) => s.name);
    // Riya was absent on all three marked days; Meera was always present.
    expect(names).toContain('Riya');
    expect(names).not.toContain('Meera');
    expect(res.body.find((s: { name: string }) => s.name === 'Riya').percent).toBe(0);
  });
});

describe('parent view', () => {
  it("shows a parent their child's month and nobody else's", async () => {
    const { accessToken } = await t.login(riya.guardianPhone);
    const parent = t.as(accessToken, school.instituteId);
    const res = await parent.get(`/family/children/${riya.id}/attendance?month=${today.slice(0, 7)}`).expect(200);
    expect(res.body.days.some((d: { date: string; status: string }) => d.date === today && d.status === 'absent')).toBe(true);
    await parent.get(`/family/children/${kabir.id}/attendance?month=${today.slice(0, 7)}`).expect(404);
  });
});
