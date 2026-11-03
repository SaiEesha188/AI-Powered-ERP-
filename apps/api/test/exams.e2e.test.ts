// Exams, marks and report cards (M13, M14): the report-card cycle end to end.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, localDate } from '../src/common/institute.js';
import { createTestApp, type TestApp, uniquePhone } from './helpers.js';

let t: TestApp;
let school: Awaited<ReturnType<TestApp['setupSchool']>>;
let admin: ReturnType<TestApp['as']>;
let principal: ReturnType<TestApp['as']>;
let classTeacher: ReturnType<TestApp['as']>; // class teacher of A, teaches Maths in A and B
let scienceTeacher: ReturnType<TestApp['as']>; // Science in A only
let maths: string;
let science: string;
type Student = Awaited<ReturnType<TestApp['admitStudent']>>;
let riya: Student, kabir: Student, meera: Student, zoe: Student, yash: Student;
let examId: string;
let mathsPaper: string;
let sciencePaper: string;

const today = localDate('Asia/Kolkata');

async function staffMember(name: string) {
  const phone = uniquePhone();
  const res = await school.admin.post('/staff', { name, phone, designation: 'TGT', roles: ['teacher', 'class_teacher'] }).expect(201);
  return { id: res.body.id as string, api: t.as((await t.login(phone)).accessToken, school.instituteId) };
}

beforeAll(async () => {
  t = await createTestApp();
  school = await t.setupSchool();
  admin = school.admin;
  principal = t.as((await t.addMember(school.adminToken, school.instituteId, ['principal'])).token, school.instituteId);
  maths = (await admin.post('/subjects', { name: 'Mathematics', code: 'MATH' }).expect(201)).body.id;
  science = (await admin.post('/subjects', { name: 'Science', code: 'SCI' }).expect(201)).body.id;
  await admin.put(`/classes/${school.classId}/subjects`, { subjects: [{ subjectId: maths }, { subjectId: science }] }).expect(200);
  const ct = await staffMember('Class Teacher');
  await admin.patch(`/sections/${school.sectionA}`, { classTeacherId: ct.id }).expect(200);
  await admin.post(`/sections/${school.sectionA}/assignments`, { staffId: ct.id, subjectId: maths }).expect(201);
  await admin.post(`/sections/${school.sectionB}/assignments`, { staffId: ct.id, subjectId: maths }).expect(201);
  classTeacher = ct.api;
  const st = await staffMember('Science Teacher');
  await admin.post(`/sections/${school.sectionA}/assignments`, { staffId: st.id, subjectId: science }).expect(201);
  scienceTeacher = st.api;
  riya = await t.admitStudent(admin, { name: 'Riya', sectionId: school.sectionA, rollNo: 1 });
  kabir = await t.admitStudent(admin, { name: 'Kabir', sectionId: school.sectionA, rollNo: 2 });
  meera = await t.admitStudent(admin, { name: 'Meera', sectionId: school.sectionA, rollNo: 3 });
  zoe = await t.admitStudent(admin, { name: 'Zoe', sectionId: school.sectionB, rollNo: 1 });
  yash = await t.admitStudent(admin, { name: 'Yash', sectionId: school.sectionB, rollNo: 2 });
});
afterAll(() => t.close());

describe('setup (EX-01, EX-02, CFG-04)', () => {
  it('seeds assessment types and a grade scale on first use', async () => {
    const types = await admin.get('/exams/assessment-types').expect(200);
    expect(types.body.map((x: { name: string; weightage: number }) => `${x.name}:${x.weightage}`)).toEqual(['Unit test:10', 'Mid-term:30', 'Final:60']);
    const scales = await admin.get('/exams/grade-scales').expect(200);
    expect(scales.body[0]).toMatchObject({ isDefault: true });
    expect(scales.body[0].bands[0]).toMatchObject({ grade: 'A1', minPct: 91, maxPct: 100, points: 10 });
  });

  it('refuses overlapping grade bands', async () => {
    await admin.post('/exams/grade-scales', { name: 'Bad', bands: [{ minPct: 50, maxPct: 100, grade: 'A' }, { minPct: 40, maxPct: 60, grade: 'B' }] }).expect(400);
  });

  it('creates an exam with a paper per class subject', async () => {
    const types = await admin.get('/exams/assessment-types').expect(200);
    const midTerm = types.body.find((x: { name: string }) => x.name === 'Mid-term');
    const res = await admin
      .post('/exams', { name: 'Mid-term 2026', assessmentTypeId: midTerm.id, startDate: addDays(today, 3), endDate: addDays(today, 6), classIds: [school.classId], defaultMaxMarks: 80, defaultPassMarks: 26 })
      .expect(201);
    examId = res.body.id;
    expect(res.body).toMatchObject({ status: 'draft', assessmentType: 'Mid-term' });
    expect(res.body.papers.map((p: { subjectName: string; maxMarks: number }) => `${p.subjectName}:${p.maxMarks}`).sort()).toEqual(['Mathematics:80', 'Science:80']);
    expect(res.body.sections.map((s: { name: string; students: number; locked: boolean }) => `${s.name}:${s.students}:${s.locked}`)).toEqual(['A:3:false', 'B:2:false']);
    mathsPaper = res.body.papers.find((p: { subjectId: string }) => p.subjectId === maths).id;
    sciencePaper = res.body.papers.find((p: { subjectId: string }) => p.subjectId === science).id;
    await admin.post('/exams', { name: 'Outside year', assessmentTypeId: midTerm.id, startDate: addDays(today, 300), endDate: addDays(today, 301), classIds: [school.classId] }).expect(400);
  });

  it('needs every paper dated before the date sheet goes out (EX-03)', async () => {
    await classTeacher.put(`/exams/papers/${mathsPaper}/marks`, { sectionId: school.sectionA, entries: [{ studentId: riya.id, marks: 70 }] }).expect(409);
    await admin.post(`/exams/${examId}/schedule`).expect(400);
    await admin.patch(`/exams/papers/${mathsPaper}`, { date: addDays(today, 3), syllabusScope: 'Chapters 1 to 5' }).expect(200);
    await admin.patch(`/exams/papers/${sciencePaper}`, { date: addDays(today, 10) }).expect(400); // outside exam dates
    await admin.patch(`/exams/papers/${sciencePaper}`, { date: addDays(today, 5), passMarks: 90 }).expect(400); // above max
    await admin.patch(`/exams/papers/${sciencePaper}`, { date: addDays(today, 5) }).expect(200);
    const res = await admin.post(`/exams/${examId}/schedule`).expect(200);
    expect(res.body.status).toBe('scheduled');
    await t.runNotifications();
    const msg = t.whatsapp.to(riya.guardianPhone).find((m) => m.template === 'exam_schedule_v1');
    expect(msg?.params[1]).toBe('Mid-term 2026');
    // Parents see the date sheet and syllabus.
    const parent = t.as((await t.login(riya.guardianPhone)).accessToken, school.instituteId);
    const sheet = await parent.get(`/family/children/${riya.id}/exams`).expect(200);
    expect(sheet.body[0].papers.map((p: { subject: string; syllabusScope: string | null }) => `${p.subject}:${p.syllabusScope ?? ''}`)).toEqual(['Mathematics:Chapters 1 to 5', 'Science:']);
  });
});

describe('marks entry (MK-01, MK-02, BR-04, BR-06)', () => {
  it('lists the teacher’s papers as tasks', async () => {
    const tasks = await classTeacher.get('/exams/my-tasks').expect(200);
    // Maths in A and B (assigned) plus Science in A (class teacher).
    expect(tasks.body.map((x: { subjectName: string; sectionName: string }) => `${x.subjectName} ${x.sectionName}`).sort()).toEqual(['Mathematics A', 'Mathematics B', 'Science A']);
    const science = await scienceTeacher.get('/exams/my-tasks').expect(200);
    expect(science.body.map((x: { subjectName: string; sectionName: string }) => `${x.subjectName} ${x.sectionName}`)).toEqual(['Science A']);
  });

  it('enters marks for an assigned paper and validates them', async () => {
    const grid = await classTeacher.get(`/exams/papers/${mathsPaper}/marks?sectionId=${school.sectionA}`).expect(200);
    expect(grid.body.canEdit).toBe(true);
    expect(grid.body.students.map((s: { name: string; marks: number | null }) => `${s.name}:${s.marks}`)).toEqual(['Riya:null', 'Kabir:null', 'Meera:null']);
    await classTeacher.put(`/exams/papers/${mathsPaper}/marks`, { sectionId: school.sectionA, entries: [{ studentId: riya.id, marks: 81 }] }).expect(400); // above 80
    await classTeacher.put(`/exams/papers/${mathsPaper}/marks`, { sectionId: school.sectionA, entries: [{ studentId: zoe.id, marks: 50 }] }).expect(400); // not in A
    const res = await classTeacher
      .put(`/exams/papers/${mathsPaper}/marks`, { sectionId: school.sectionA, entries: [{ studentId: riya.id, marks: 76 }, { studentId: kabir.id, marks: 20 }, { studentId: meera.id, marks: 64 }] })
      .expect(200);
    expect(res.body.students.map((s: { marks: number | null }) => s.marks)).toEqual([76, 20, 64]);
  });

  it('keeps teachers to their own subjects and sections', async () => {
    await scienceTeacher.put(`/exams/papers/${mathsPaper}/marks`, { sectionId: school.sectionA, entries: [{ studentId: riya.id, marks: 10 }] }).expect(403);
    await scienceTeacher.put(`/exams/papers/${sciencePaper}/marks`, { sectionId: school.sectionB, entries: [{ studentId: zoe.id, marks: 10 }] }).expect(403);
    await scienceTeacher
      .put(`/exams/papers/${sciencePaper}/marks`, { sectionId: school.sectionA, entries: [{ studentId: riya.id, marks: 72 }, { studentId: kabir.id, marks: null, absent: true }] })
      .expect(200);
  });

  it('hides marks from parents until publication (BR-05)', async () => {
    const parent = t.as((await t.login(riya.guardianPhone)).accessToken, school.instituteId);
    const cards = await parent.get(`/family/children/${riya.id}/report-cards`).expect(200);
    expect(cards.body).toEqual([]);
    await parent.get(`/exams/papers/${mathsPaper}/marks?sectionId=${school.sectionA}`).expect(403);
  });
});

describe('moderation (MK-03, BR-07)', () => {
  it('refuses to lock while marks are missing', async () => {
    const res = await classTeacher.post(`/exams/${examId}/sections/${school.sectionA}/lock`).expect(400);
    expect(res.body.message).toContain('Science: 1 student');
  });

  it('lets the class teacher lock a complete section, after which only the principal may correct', async () => {
    // The class teacher may fill the gap in any subject of their section.
    await classTeacher.put(`/exams/papers/${sciencePaper}/marks`, { sectionId: school.sectionA, entries: [{ studentId: meera.id, marks: 40 }] }).expect(200);
    await scienceTeacher.post(`/exams/${examId}/sections/${school.sectionA}/lock`).expect(403);
    const res = await classTeacher.post(`/exams/${examId}/sections/${school.sectionA}/lock`).expect(200);
    expect(res.body.sections.find((s: { name: string }) => s.name === 'A').locked).toBe(true);
    expect(res.body.status).toBe('scheduled'); // B still open

    await classTeacher.put(`/exams/papers/${mathsPaper}/marks`, { sectionId: school.sectionA, entries: [{ studentId: riya.id, marks: 77 }] }).expect(403);
    await principal.put(`/exams/papers/${mathsPaper}/marks`, { sectionId: school.sectionA, entries: [{ studentId: riya.id, marks: 77 }] }).expect(400); // no reason
    await principal.put(`/exams/papers/${mathsPaper}/marks`, { sectionId: school.sectionA, entries: [{ studentId: riya.id, marks: 77 }], reason: 'Totalling error' }).expect(200);
    const log = await principal.get('/audit-logs?entity=exam_paper&limit=20').expect(200);
    expect(log.body[0]).toMatchObject({ action: 'marks.correct' });
    expect(log.body[0].after.reason).toBe('Totalling error');
  });

  it('cannot generate report cards until every section is locked', async () => {
    const res = await admin.post(`/exams/${examId}/report-cards/generate`).expect(400);
    expect(res.body.message).toContain('Class 8 B');
    // B has no class teacher; the principal enters and locks it.
    await principal.put(`/exams/papers/${mathsPaper}/marks`, { sectionId: school.sectionB, entries: [{ studentId: zoe.id, marks: 60 }, { studentId: yash.id, marks: 60 }] }).expect(200);
    await principal.put(`/exams/papers/${sciencePaper}/marks`, { sectionId: school.sectionB, entries: [{ studentId: zoe.id, marks: 30 }, { studentId: yash.id, marks: 24 }] }).expect(200);
    await classTeacher.post(`/exams/${examId}/sections/${school.sectionB}/lock`).expect(403);
    const locked = await principal.post(`/exams/${examId}/sections/${school.sectionB}/lock`).expect(200);
    expect(locked.body.status).toBe('locked');
  });
});

describe('report cards (MK-04..10)', () => {
  it('computes totals, grades, ranks, class averages and attendance', async () => {
    const gen = await admin.post(`/exams/${examId}/report-cards/generate`).expect(200);
    expect(gen.body.generated).toBe(5);
    const list = await admin.get(`/exams/${examId}/report-cards`).expect(200);
    const byName = Object.fromEntries(list.body.map((c: { name: string }) => [c.name, c]));
    // Riya: 77 + 72 = 149/160 = 93.1% → A1, rank 1.
    expect(byName.Riya).toMatchObject({ percent: 93.1, grade: 'A1', rank: 1, passed: true });
    // Meera: 64 + 40 = 104/160 = 65% → B2, rank 2.
    expect(byName.Meera).toMatchObject({ percent: 65, grade: 'B2', rank: 2, passed: true });
    // Kabir: 20 + absent = 20/160 = 12.5% → E, failed, rank 3.
    expect(byName.Kabir).toMatchObject({ percent: 12.5, grade: 'E', rank: 3, passed: false });
    // Zoe and Yash: 90 and 84 → ranks 1 and 2 in B.
    expect(byName.Zoe).toMatchObject({ sectionName: 'B', rank: 1 });
    expect(byName.Yash).toMatchObject({ rank: 2, passed: false }); // 24 < 26 pass marks in Science

    const card = await admin.get(`/report-cards/${byName.Kabir.id}`).expect(200);
    const sci = card.body.data.subjects.find((s: { subject: string }) => s.subject === 'Science');
    expect(sci).toMatchObject({ absent: true, marks: null, grade: null, passed: false, classAverage: 70 }); // present students: (72 + 40) / 2 = 56 of 80
    expect(card.body.data).toMatchObject({ sectionSize: 3, totalMax: 160 });
  });

  it('lets the class teacher write remarks for their own section only', async () => {
    const list = await admin.get(`/exams/${examId}/report-cards`).expect(200);
    const riyaCard = list.body.find((c: { name: string }) => c.name === 'Riya');
    const zoeCard = list.body.find((c: { name: string }) => c.name === 'Zoe');
    await classTeacher.patch(`/report-cards/${riyaCard.id}/remarks`, { remarks: 'Excellent work this term.' }).expect(200);
    await classTeacher.patch(`/report-cards/${zoeCard.id}/remarks`, { remarks: 'Nope' }).expect(403);
    await principal.patch(`/report-cards/${zoeCard.id}/remarks`, { remarks: 'Keep it up.' }).expect(200);
    // Regenerating keeps remarks.
    await admin.post(`/exams/${examId}/report-cards/generate`).expect(200);
    const again = await admin.get(`/report-cards/${riyaCard.id}`).expect(200);
    expect(again.body.remarks).toBe('Excellent work this term.');
  });

  it('is published by the principal, after which parents see it and marks freeze', async () => {
    await admin.post(`/exams/${examId}/report-cards/publish`).expect(403);
    const res = await principal.post(`/exams/${examId}/report-cards/publish`).expect(200);
    expect(res.body).toMatchObject({ status: 'published', reportCards: { total: 5, published: 5 } });
    await t.runNotifications();
    const msg = t.whatsapp.to(riya.guardianPhone).find((m) => m.template === 'report_card_v1');
    expect(msg?.params[0]).toBe('Riya');

    const parent = t.as((await t.login(riya.guardianPhone)).accessToken, school.instituteId);
    const cards = await parent.get(`/family/children/${riya.id}/report-cards`).expect(200);
    expect(cards.body[0]).toMatchObject({ examName: 'Mid-term 2026', percent: 93.1, grade: 'A1', passed: true });
    expect(msg?.params[2]).toContain(cards.body[0].id);
    const detail = await parent.get(`/family/children/${riya.id}/report-cards/${cards.body[0].id}`).expect(200);
    expect(detail.body.remarks).toBe('Excellent work this term.');
    expect(detail.body.data.subjects[0].classAverage).not.toBeNull();
    // Another family's card is not reachable.
    const zoeCards = await admin.get(`/exams/${examId}/report-cards`).expect(200);
    const zoeCard = zoeCards.body.find((c: { name: string }) => c.name === 'Zoe');
    await parent.get(`/family/children/${riya.id}/report-cards/${zoeCard.id}`).expect(404);

    await principal.put(`/exams/papers/${mathsPaper}/marks`, { sectionId: school.sectionA, entries: [{ studentId: riya.id, marks: 1 }], reason: 'Too late' }).expect(409);
    await principal.patch(`/report-cards/${cards.body[0].id}/remarks`, { remarks: 'late' }).expect(409);
  });

  it('summarises results for management', async () => {
    const res = await principal.get(`/exams/${examId}/analysis`).expect(200);
    expect(res.body).toMatchObject({ students: 5, passed: 3 });
    const a = res.body.sections.find((s: { section: string }) => s.section === 'Class 8 · A');
    expect(a).toMatchObject({ students: 3, passed: 2 });
    expect(a.subjects.find((s: { subject: string }) => s.subject === 'Science')).toMatchObject({ absent: 1, passed: 2 });
  });
});
