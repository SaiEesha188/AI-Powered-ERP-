// Working days, holidays and events (CAL-02..06).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let school: Awaited<ReturnType<TestApp['setupSchool']>>;
let class9: string;
let principal: { token: string };

beforeAll(async () => {
  t = await createTestApp();
  school = await t.setupSchool();
  class9 = (await school.admin.post('/classes', { name: 'Class 9', level: 9 }).expect(201)).body.id;
  principal = await t.addMember(school.adminToken, school.instituteId, ['principal']);
});
afterAll(() => t.close());

async function dayStatus(date: string, classId: string) {
  return (await school.admin.get(`/calendar/events/day-status?date=${date}&classId=${classId}`).expect(200)).body;
}

describe('holidays and events', () => {
  it('declares a whole-institute holiday that closes the day', async () => {
    const res = await school.admin.post('/calendar/events', { type: 'holiday', title: 'Diwali', startDate: '2026-11-09', endDate: '2026-11-10' }).expect(201);
    expect(res.body).toMatchObject({ status: 'approved', scope: 'all', classes: [] });
    expect(await dayStatus('2026-11-09', school.classId)).toEqual({ working: false, reason: 'Diwali', halfDay: false });
    expect(await dayStatus('2026-11-11', school.classId)).toEqual({ working: true, halfDay: false });
  });

  it('treats weekly offs as closed (CAL-02)', async () => {
    // 2026-11-08 is a Sunday; the school pack works Monday to Saturday.
    expect(await dayStatus('2026-11-08', school.classId)).toMatchObject({ working: false, reason: 'Weekly off' });
    expect(await dayStatus('2026-11-07', school.classId)).toMatchObject({ working: true });
    await school.admin.patch('/institute', { workingDays: [1, 2, 3, 4, 5] }).expect(200);
    expect(await dayStatus('2026-11-07', school.classId)).toMatchObject({ working: false });
    await school.admin.patch('/institute', { workingDays: [1, 2, 3, 4, 5, 6] }).expect(200);
  });

  it('validates time-of-day settings', async () => {
    const res = await school.admin.patch('/institute', { homeworkDigestTime: '17:30', attendanceCutoffTime: '09:45' }).expect(200);
    expect(res.body.settings).toMatchObject({ homeworkDigestTime: '17:30', attendanceCutoffTime: '09:45' });
    await school.admin.patch('/institute', { homeworkDigestTime: '25:00' }).expect(400);
    await school.admin.patch('/institute', { attendanceCutoffTime: '9:45' }).expect(400);
  });

  it('closes only the listed classes, and staff-only days close no classes', async () => {
    await school.admin
      .post('/calendar/events', { type: 'holiday', title: 'Class 9 trip', startDate: '2026-11-12', endDate: '2026-11-12', scope: 'classes', classIds: [class9] })
      .expect(201);
    await school.admin.post('/calendar/events', { type: 'holiday', title: 'Staff training', startDate: '2026-11-13', endDate: '2026-11-13', scope: 'staff' }).expect(201);
    expect(await dayStatus('2026-11-12', class9)).toMatchObject({ working: false, reason: 'Class 9 trip' });
    expect(await dayStatus('2026-11-12', school.classId)).toMatchObject({ working: true });
    expect(await dayStatus('2026-11-13', school.classId)).toMatchObject({ working: true });
  });

  it('marks half days without closing', async () => {
    await school.admin.post('/calendar/events', { type: 'half_day', title: 'Sports prep', startDate: '2026-11-14', endDate: '2026-11-14' }).expect(201);
    expect(await dayStatus('2026-11-14', school.classId)).toEqual({ working: true, halfDay: true });
  });

  it('validates input', async () => {
    await school.admin.post('/calendar/events', { type: 'holiday', title: 'Backwards', startDate: '2026-11-20', endDate: '2026-11-19' }).expect(400);
    await school.admin.post('/calendar/events', { type: 'event', title: 'No classes', startDate: '2026-11-20', endDate: '2026-11-20', scope: 'classes' }).expect(400);
    await school.admin
      .post('/calendar/events', { type: 'event', title: 'Bad class', startDate: '2026-11-20', endDate: '2026-11-20', scope: 'classes', classIds: ['00000000-0000-4000-8000-000000000000'] })
      .expect(400);
  });
});

describe('approval (CAL-06)', () => {
  it('holds holidays for principal approval when the institute requires it', async () => {
    await school.admin.patch('/institute', { holidayApprovalRequired: true }).expect(200);
    const pending = await school.admin.post('/calendar/events', { type: 'holiday', title: 'Rain day', startDate: '2026-11-16', endDate: '2026-11-16' }).expect(201);
    expect(pending.body.status).toBe('pending');
    // Pending holidays do not close the day.
    expect(await dayStatus('2026-11-16', school.classId)).toMatchObject({ working: true });

    await school.admin.post(`/calendar/events/${pending.body.id}/decision`, { decision: 'approve' }).expect(403);
    const asPrincipal = t.as(principal.token, school.instituteId);
    await asPrincipal.post(`/calendar/events/${pending.body.id}/decision`, { decision: 'approve' }).expect(200);
    await asPrincipal.post(`/calendar/events/${pending.body.id}/decision`, { decision: 'reject' }).expect(409);
    expect(await dayStatus('2026-11-16', school.classId)).toMatchObject({ working: false, reason: 'Rain day' });

    // Events other than holidays never need approval.
    const ptm = await school.admin.post('/calendar/events', { type: 'ptm', title: 'PTM', startDate: '2026-11-21', endDate: '2026-11-21' }).expect(201);
    expect(ptm.body.status).toBe('approved');
    await school.admin.patch('/institute', { holidayApprovalRequired: false }).expect(200);
  });
});

describe('family calendar', () => {
  it("shows parents approved events for everyone and their children's classes only", async () => {
    const child = await t.admitStudent(school.admin, { name: 'Calendar Kid', sectionId: school.sectionA });
    const { accessToken } = await t.login(child.guardianPhone);
    const res = await t.as(accessToken, school.instituteId).get('/family/calendar?from=2026-11-01&to=2026-11-30').expect(200);
    const titles = res.body.map((e: { title: string }) => e.title);
    expect(titles).toContain('Diwali');
    expect(titles).toContain('PTM');
    expect(titles).not.toContain('Class 9 trip');
    expect(titles).not.toContain('Staff training');
    await t.as(accessToken, school.instituteId).get('/calendar/events?from=2026-11-01&to=2026-11-30').expect(403);
  });
});
