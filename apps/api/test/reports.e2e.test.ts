// Dashboards (RPT-01, ATT-08) and exportable reports (RPT-02, BRD §11).
import { assignRole, findOrCreateUserByPhone } from '@erp/db';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, localDate } from '../src/common/institute.js';
import { toCsv } from '../src/common/export.js';
import { createTestApp, type TestApp, uniquePhone } from './helpers.js';

let t: TestApp;
let school: Awaited<ReturnType<TestApp['setupSchool']>>;
let teacher: ReturnType<TestApp['as']>;
let principal: ReturnType<TestApp['as']>;
let management: ReturnType<TestApp['as']>;
let riya: Awaited<ReturnType<TestApp['admitStudent']>>;
let kabir: Awaited<ReturnType<TestApp['admitStudent']>>;
let inB: Awaited<ReturnType<TestApp['admitStudent']>>;
let parent: ReturnType<TestApp['as']>;
let dueToday: string;

const today = localDate('Asia/Kolkata');
const month = today.slice(0, 7);

/** Supertest parser that keeps binary bodies as a Buffer. */
// supertest types the response as its own Response; only the stream API is used here.
const binary = (res: any, done: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

beforeAll(async () => {
  t = await createTestApp();
  school = await t.setupSchool();
  await school.admin.patch('/institute', { workingDays: [1, 2, 3, 4, 5, 6, 7] }).expect(200);
  const maths = (await school.admin.post('/subjects', { name: 'Maths', code: 'MATH' }).expect(201)).body.id;
  await school.admin.put(`/classes/${school.classId}/subjects`, { subjects: [{ subjectId: maths }] }).expect(200);
  const teacherPhone = uniquePhone();
  const staff = await school.admin.post('/staff', { name: 'Class Teacher', phone: teacherPhone, designation: 'TGT' }).expect(201);
  await school.admin.patch(`/sections/${school.sectionA}`, { classTeacherId: staff.body.id }).expect(200);
  teacher = t.as((await t.login(teacherPhone)).accessToken, school.instituteId);
  principal = t.as((await t.addMember(school.adminToken, school.instituteId, ['principal'])).token, school.instituteId);
  const ownerPhone = uniquePhone();
  const owner = await findOrCreateUserByPhone(t.system, { phone: ownerPhone, name: 'Owner' });
  await assignRole(t.system, { instituteId: school.instituteId, userId: owner.id, roleCode: 'management' });
  management = t.as((await t.login(ownerPhone)).accessToken, school.instituteId);

  riya = await t.admitStudent(school.admin, { name: 'Riya', sectionId: school.sectionA, rollNo: 1 });
  kabir = await t.admitStudent(school.admin, { name: '=HYPERLINK("http://evil")', sectionId: school.sectionA, rollNo: 2 });
  inB = await t.admitStudent(school.admin, { name: 'In B', sectionId: school.sectionB });
  parent = t.as((await t.login(riya.guardianPhone)).accessToken, school.instituteId);

  await teacher.put(`/attendance/sections/${school.sectionA}`, { date: today, records: [{ studentId: riya.id, status: 'absent' }] }).expect(200);
  const hw = await teacher.post('/homework', { sectionIds: [school.sectionA], subjectId: maths, title: 'Tables of 7', dueDate: today }).expect(201);
  dueToday = hw.body[0].id;
  await school.admin.post('/calendar/events', { type: 'ptm', title: 'PTM', startDate: addDays(today, 3), endDate: addDays(today, 3) }).expect(201);
  await school.admin.post('/circulars', { title: 'Annual day', body: 'Join us.', requiresAck: true, audiences: [{ type: 'all' }], publish: true }).expect(201);
  await t.runNotifications();
});
afterAll(() => t.close());

describe('dashboards (RPT-01)', () => {
  it("shows the principal today's gaps, risks and what is coming (ATT-08)", async () => {
    const res = await principal.get('/dashboards/principal').expect(200);
    expect(res.body.attendance).toMatchObject({ sections: 2, sectionsMarked: 1, absent: 1, present: 1 });
    expect(res.body.attendance.notMarked.map((s: { sectionName: string }) => s.sectionName)).toEqual(['B']);
    expect(res.body.homeworkToday.sectionsWithHomework).toBe(1);
    expect(res.body.atRisk.students.map((s: { name: string }) => s.name)).toContain('Riya');
    expect(res.body.upcomingEvents.map((e: { title: string }) => e.title)).toContain('PTM');
    expect(res.body.recentCirculars[0]).toMatchObject({ title: 'Annual day', recipients: 4, acknowledged: 0 });
    await parent.get('/dashboards/principal').expect(403);
  });

  it('gives management enrolment, adoption and reach (BRD §3.5 KPIs)', async () => {
    const res = await management.get('/dashboards/institute').expect(200);
    expect(res.body.enrolment.total).toBe(3);
    expect(res.body.enrolment.byClass[0]).toMatchObject({ className: 'Class 8', students: 3 });
    expect(res.body.adoption.teachers).toMatchObject({ total: 1, activeLast7Days: 1 });
    expect(res.body.adoption.parents).toMatchObject({ total: 3, activeLast7Days: 1 });
    expect(res.body.attendanceLast30Days).toBe(50);
    expect(res.body.communication.reachedPercent).toBe(100);
    await teacher.get('/dashboards/institute').expect(200);
  });

  it("shows a teacher their sections and homework awaiting review", async () => {
    let res = await teacher.get('/dashboards/teacher').expect(200);
    expect(res.body.sections).toEqual([expect.objectContaining({ name: 'A', isClassTeacher: true, attendanceMarkedToday: true })]);
    expect(res.body.homeworkAwaitingReview.map((h: { id: string }) => h.id)).toEqual([dueToday]);
    expect(res.body.unreadCirculars).toBe(1);
    await teacher.put(`/homework/${dueToday}/completion`, { records: [{ studentId: riya.id, status: 'done' }] }).expect(200);
    res = await teacher.get('/dashboards/teacher').expect(200);
    expect(res.body.homeworkAwaitingReview).toEqual([]);
  });

  it("gives a parent one screen per child", async () => {
    const res = await parent.get(`/family/children/${riya.id}/summary`).expect(200);
    expect(res.body.attendanceThisMonth).toMatchObject({ absent: 1, marked: 1, percent: 0 });
    expect(res.body.pendingHomework).toEqual([]); // marked done above
    expect(res.body.upcomingEvents.map((e: { title: string }) => e.title)).toEqual(['PTM']);
    expect(res.body.unreadCirculars).toBe(1);
    await parent.get(`/family/children/${inB.id}/summary`).expect(404);
  });
});

describe('exports (RPT-02)', () => {
  it('downloads the monthly register as CSV that Excel opens safely', async () => {
    const res = await school.admin.get(`/reports/attendance-register?sectionId=${school.sectionA}&month=${month}&format=csv`).buffer(true).parse(binary).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(`attendance-register-${month}.csv`);
    const text = (res.body as Buffer).toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const [header, first, second] = text.slice(1).split('\r\n');
    expect(header!.startsWith('Roll,Admission no,Name,01,02')).toBe(true);
    expect(first).toContain(',Riya,');
    // Formula-looking names are neutralised so the cell is not executed.
    expect(second).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it('downloads Excel workbooks', async () => {
    const res = await school.admin.get('/reports/students?format=xlsx').buffer(true).parse(binary).expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).values).toEqual([undefined, 'Class', 'Section', 'Roll', 'Admission no', 'Name', 'Gender', 'Date of birth', 'Guardians']);
    expect(ws.rowCount).toBe(4);
    expect(String(ws.getRow(2).getCell(8).value)).toContain('Parent of Riya');
  });

  it('serves the other standard reports as JSON or files', async () => {
    const defaulters = await school.admin.get(`/reports/attendance-defaulters?from=${addDays(today, -7)}&to=${today}`).expect(200);
    expect(defaulters.body.map((r: { name: string }) => r.name)).toEqual(['Riya']);
    const reach = await school.admin.get(`/reports/communication-reach?month=${month}`).expect(200);
    expect(reach.body.find((r: { eventType: string }) => r.eventType === 'circular.published')).toMatchObject({ total: 4, sent: 4, failed: 0 });
    const homework = await school.admin.get(`/reports/homework?from=${today}&to=${today}&format=csv`).expect(200);
    expect(homework.text).toContain('Class 8,A,1,1,0,0');
  });

  it('keeps reports behind the right permissions and audits every export (§5.2)', async () => {
    await parent.get('/reports/students').expect(403);
    const accountant = await t.addMember(school.adminToken, school.instituteId, ['accountant']);
    await t.as(accountant.token, school.instituteId).get(`/reports/communication-reach?month=${month}`).expect(403);
    const log = await principal.get('/audit-logs?entity=report&limit=50').expect(200);
    expect(log.body.map((e: { after: { report: string; format: string } }) => `${e.after.report}:${e.after.format}`).sort()).toEqual([
      'attendance_register:csv',
      'homework:csv',
      'students:xlsx',
    ]);
  });

  it('escapes CSV values', () => {
    const csv = toCsv([{ header: 'a', value: (r: { v: string }) => r.v }], [{ v: 'x,"y"' }, { v: '+1' }, { v: '@sum' }]);
    expect(csv.slice(1).split('\r\n')).toEqual(['a', '"x,""y"""', "'+1", "'@sum"]);
  });
});
