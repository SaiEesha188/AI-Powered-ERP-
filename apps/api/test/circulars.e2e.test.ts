// Circulars and notices (COM-01, COM-03): audiences, approval, notification, receipts, consent.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp, uniquePhone } from './helpers.js';

let t: TestApp;
let school: Awaited<ReturnType<TestApp['setupSchool']>>;
let teacher: ReturnType<TestApp['as']>;
let teacherPhone: string;
let principal: ReturnType<TestApp['as']>;
let inA: Awaited<ReturnType<TestApp['admitStudent']>>;
let inB: Awaited<ReturnType<TestApp['admitStudent']>>;
let parentA: ReturnType<TestApp['as']>;
let parentB: ReturnType<TestApp['as']>;
let tripCircular: string;

beforeAll(async () => {
  t = await createTestApp();
  school = await t.setupSchool();
  teacherPhone = uniquePhone();
  const staff = await school.admin.post('/staff', { name: 'Class Teacher A', phone: teacherPhone, designation: 'TGT' }).expect(201);
  await school.admin.patch(`/sections/${school.sectionA}`, { classTeacherId: staff.body.id }).expect(200);
  teacher = t.as((await t.login(teacherPhone)).accessToken, school.instituteId);
  principal = t.as((await t.addMember(school.adminToken, school.instituteId, ['principal'])).token, school.instituteId);
  inA = await t.admitStudent(school.admin, { name: 'In A', sectionId: school.sectionA });
  inB = await t.admitStudent(school.admin, { name: 'In B', sectionId: school.sectionB });
  parentA = t.as((await t.login(inA.guardianPhone)).accessToken, school.instituteId);
  parentB = t.as((await t.login(inB.guardianPhone)).accessToken, school.instituteId);
});
afterAll(() => t.close());

describe('publishing (COM-01)', () => {
  it('publishes to a section with an attachment and fixes the recipient list', async () => {
    const file = await school.admin.upload('/files', Buffer.from('%PDF-1.4 consent form'), 'consent.pdf').expect(201);
    const res = await school.admin
      .post('/circulars', {
        title: 'Science centre trip',
        body: 'Class 8A visits the science centre on Friday. Please sign the consent form.',
        requiresAck: true,
        audiences: [{ type: 'section', refId: school.sectionA }],
        fileIds: [file.body.id],
        publish: true,
      })
      .expect(201);
    tripCircular = res.body.id;
    expect(res.body).toMatchObject({ status: 'published', summary: { recipients: 1, read: 0, acknowledged: 0 } });
    expect(res.body.receipts[0]).toMatchObject({ kind: 'parent' });
  });

  it('notifies recipients with a link to the circular', async () => {
    await t.runNotifications();
    const [msg] = t.whatsapp.to(inA.guardianPhone).filter((m) => m.template === 'circular_v1');
    expect(msg!.params[1]).toBe('Science centre trip');
    expect(msg!.params[2]).toContain(`/inbox/${tripCircular}`);
    expect(t.whatsapp.to(inB.guardianPhone).filter((m) => m.template === 'circular_v1')).toEqual([]);
  });

  it('saves drafts without notifying anyone', async () => {
    const draft = await school.admin.post('/circulars', { title: 'Draft notice', body: 'Not yet', audiences: [{ type: 'parents' }] }).expect(201);
    expect(draft.body).toMatchObject({ status: 'draft', summary: { recipients: 0 } });
    const published = await school.admin.post(`/circulars/${draft.body.id}/publish`).expect(200);
    expect(published.body.summary.recipients).toBe(2);
    await school.admin.post(`/circulars/${draft.body.id}/publish`).expect(409);
  });
});

describe('receipts and consent (COM-03)', () => {
  it('records reading and "I agree" per person', async () => {
    const inbox = await parentA.get('/inbox').expect(200);
    const trip = inbox.body.find((c: { id: string }) => c.id === tripCircular);
    expect(trip).toMatchObject({ readAt: null, acknowledgedAt: null });
    expect(trip.attachments[0].name).toBe('consent.pdf');

    await parentA.post(`/inbox/${tripCircular}/read`).expect(200);
    await parentA.post(`/inbox/${tripCircular}/acknowledge`).expect(200);
    const detail = await school.admin.get(`/circulars/${tripCircular}`).expect(200);
    expect(detail.body.summary).toEqual({ recipients: 1, read: 1, acknowledged: 1 });
    const list = await school.admin.get('/circulars?status=published').expect(200);
    expect(list.body.find((c: { id: string }) => c.id === tripCircular)).toMatchObject({ recipients: 1, read: 1, acknowledged: 1 });
  });

  it('keeps circulars away from people outside the audience', async () => {
    const inbox = await parentB.get('/inbox').expect(200);
    expect(inbox.body.some((c: { id: string }) => c.id === tripCircular)).toBe(false);
    await parentB.post(`/inbox/${tripCircular}/read`).expect(404);
    await parentB.get('/circulars').expect(403);
  });

  it('only asks for acknowledgement when the circular requires it', async () => {
    const notice = await school.admin.post('/circulars', { type: 'notice', title: 'Uniform reminder', body: 'Winter uniform from Monday.', audiences: [{ type: 'all' }], publish: true }).expect(201);
    await parentA.post(`/inbox/${notice.body.id}/acknowledge`).expect(400);
    // "all" reaches staff too.
    const staffInbox = await teacher.get('/inbox').expect(200);
    expect(staffInbox.body.some((c: { id: string }) => c.id === notice.body.id)).toBe(true);
  });
});

describe('who may send', () => {
  it('limits teachers to sections they teach', async () => {
    await teacher.post('/circulars', { title: 'Homework club', body: 'Starts Monday.', audiences: [{ type: 'section', refId: school.sectionA }], publish: true }).expect(201);
    await teacher.post('/circulars', { title: 'For B', body: 'x', audiences: [{ type: 'section', refId: school.sectionB }] }).expect(403);
    await teacher.post('/circulars', { title: 'Everyone', body: 'x', audiences: [{ type: 'all' }] }).expect(403);
    await parentA.post('/circulars', { title: 'Parent post', body: 'x', audiences: [{ type: 'all' }] }).expect(403);
  });

  it('validates audiences', async () => {
    await school.admin.post('/circulars', { title: 'Bad', body: 'x', audiences: [{ type: 'class' }] }).expect(400);
    await school.admin.post('/circulars', { title: 'Bad', body: 'x', audiences: [{ type: 'section', refId: '00000000-0000-4000-8000-000000000000' }] }).expect(400);
    await school.admin.post('/circulars', { title: 'Bad', body: 'x', audiences: [{ type: 'user', refId: '00000000-0000-4000-8000-000000000000' }] }).expect(400);
  });
});

describe('approval', () => {
  it('holds circulars for the principal when the institute requires it', async () => {
    await school.admin.patch('/institute', { circularApprovalRequired: true }).expect(200);
    const res = await school.admin.post('/circulars', { title: 'Fee revision', body: 'New fees from April.', audiences: [{ type: 'parents' }], publish: true }).expect(201);
    expect(res.body).toMatchObject({ status: 'pending_approval', summary: { recipients: 0 } });
    await school.admin.post(`/circulars/${res.body.id}/decision`, { decision: 'approve' }).expect(403);
    const approved = await principal.post(`/circulars/${res.body.id}/decision`, { decision: 'approve' }).expect(200);
    expect(approved.body).toMatchObject({ status: 'published', summary: { recipients: 2 } });

    const second = await school.admin.post('/circulars', { title: 'Rejected idea', body: 'x', audiences: [{ type: 'parents' }], publish: true }).expect(201);
    const rejected = await principal.post(`/circulars/${second.body.id}/decision`, { decision: 'reject' }).expect(200);
    expect(rejected.body.status).toBe('draft');
    // An approver publishes directly.
    const direct = await principal.post('/circulars', { title: 'From the principal', body: 'x', audiences: [{ type: 'staff' }], publish: true }).expect(201);
    expect(direct.body.status).toBe('published');
    await school.admin.patch('/institute', { circularApprovalRequired: false }).expect(200);
  });
});
