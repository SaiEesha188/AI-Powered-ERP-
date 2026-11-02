// Notification engine (M15, BRD §9.9): absence alerts, holiday notices, rules, digests,
// retries, SMS fallback, delivery receipts and quotas.
import { eq, institutes, organizations, plans } from '@erp/db';
import { MESSAGE_TEMPLATES, renderTemplate } from '@erp/shared';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, localDate, nextLocalTime, zonedTimeToUtc } from '../src/common/institute.js';
import { MetaWhatsAppSender, SendError } from '../src/notifications/whatsapp.js';
import { createTestApp, type TestApp, uniquePhone } from './helpers.js';

let t: TestApp;
let school: Awaited<ReturnType<TestApp['setupSchool']>>;
const today = localDate('Asia/Kolkata');
const HOUR = 60 * 60 * 1000;

type Student = { id: string; guardianPhone: string };
let riya: Student; // guardian opted in to WhatsApp
let kabir: Student; // guardian not opted in, prefers Hindi
let meera: Student;
const absentToday = new Set<string>();

async function admit(name: string, optIn: boolean, language = 'en'): Promise<Student> {
  const guardianPhone = uniquePhone();
  const res = await school.admin
    .post('/students', { name, sectionId: school.sectionA, guardians: [{ name: `Parent of ${name}`, phone: guardianPhone, relation: 'mother', whatsappOptIn: optIn, language }] })
    .expect(201);
  return { id: res.body.id, guardianPhone };
}

/** Marks today's attendance for section A with exactly these students absent. */
async function setAbsent(...students: Student[]) {
  absentToday.clear();
  for (const s of students) absentToday.add(s.id);
  await school.admin.put(`/attendance/sections/${school.sectionA}`, { date: today, records: [...absentToday].map((studentId) => ({ studentId, status: 'absent' })) }).expect(200);
}

async function deliveries(query = '') {
  return (await school.admin.get(`/messages?limit=200${query}`).expect(200)).body as {
    toAddress: string;
    channel: string;
    status: string;
    eventType: string;
    attempts: number;
    error: string | null;
    readAt: string | null;
  }[];
}

beforeAll(async () => {
  t = await createTestApp();
  school = await t.setupSchool();
  await school.admin.patch('/institute', { workingDays: [1, 2, 3, 4, 5, 6, 7] }).expect(200);
  riya = await admit('Riya', true);
  kabir = await admit('Kabir', false, 'hi');
  meera = await admit('Meera', true);
});
afterAll(() => t.close());

describe('absence alerts (ATT-04, BR-11)', () => {
  it('sends WhatsApp to opted-in guardians and SMS to the rest, in their language', async () => {
    await setAbsent(riya, kabir);
    await t.runNotifications();
    const [wa] = t.whatsapp.to(riya.guardianPhone);
    expect(wa).toMatchObject({ template: 'student_absent_v1', language: 'en' });
    expect(wa!.params[0]).toBe('Riya');
    expect(t.whatsapp.to(kabir.guardianPhone)).toEqual([]);
    const sms = t.sms.texts.find((m) => m.phone === kabir.guardianPhone);
    expect(sms?.text).toContain('Kabir');
    expect(sms?.text).toContain('अनुपस्थित');
    const log = await deliveries('&eventType=attendance.absent');
    expect(log.map((d) => `${d.channel}:${d.status}`).sort()).toEqual(['sms:sent', 'whatsapp:sent']);
  });

  it('does not alert again when the same day is re-saved', async () => {
    await setAbsent(riya, kabir);
    await t.runNotifications();
    expect(t.whatsapp.to(riya.guardianPhone)).toHaveLength(1);
  });

  it('sends nothing when the absence is corrected before the worker runs', async () => {
    await setAbsent(riya, kabir, meera);
    await setAbsent(riya, kabir);
    await t.runNotifications();
    expect(t.whatsapp.to(meera.guardianPhone)).toEqual([]);
  });

  it('does not alert for corrections to earlier days', async () => {
    const before = t.whatsapp.to(meera.guardianPhone).length;
    await school.admin
      .put(`/attendance/sections/${school.sectionA}`, { date: addDays(today, -1), records: [{ studentId: meera.id, status: 'absent' }], reason: 'Late entry' })
      .expect(200);
    await t.runNotifications();
    expect(t.whatsapp.to(meera.guardianPhone)).toHaveLength(before);
  });

  it('respects an institute switching the automation off (COM-04)', async () => {
    const rules = await school.admin.get('/automation-rules').expect(200);
    expect(rules.body.map((r: { event: string }) => r.event)).toContain('attendance.absent');
    await school.admin.put('/automation-rules/attendance.absent', { enabled: false, timing: 'immediate' }).expect(200);
    await setAbsent(riya, kabir, meera);
    await t.runNotifications();
    expect(t.whatsapp.to(meera.guardianPhone)).toEqual([]);
    await school.admin.put('/automation-rules/attendance.absent', { enabled: true, timing: 'immediate' }).expect(200);
    await school.admin.put('/automation-rules/not.a.thing', { enabled: true, timing: 'immediate' }).expect(404);
  });
});

describe('holiday and event notices (CAL-06)', () => {
  it("notifies staff and the class's families once per person", async () => {
    const staffPhone = uniquePhone();
    await school.admin.post('/staff', { name: 'Teacher', phone: staffPhone, designation: 'TGT' }).expect(201);
    // Riya's mother also has Riya's sibling in another class: still one message.
    await school.admin
      .post('/students', { name: 'Sibling', guardians: [{ name: 'Parent of Riya', phone: riya.guardianPhone, relation: 'mother', whatsappOptIn: true }] })
      .expect(201);
    await school.admin.post('/calendar/events', { type: 'holiday', title: 'Founders Day', startDate: addDays(today, 5), endDate: addDays(today, 5), scope: 'classes', classIds: [school.classId] }).expect(201);
    await t.runNotifications();
    expect(t.whatsapp.to(staffPhone).map((m) => m.template)).toEqual(['calendar_event_v1']);
    expect(t.whatsapp.to(riya.guardianPhone).filter((m) => m.template === 'calendar_event_v1')).toHaveLength(1);
    expect(t.sms.texts.some((m) => m.phone === kabir.guardianPhone && m.text.includes('Founders Day'))).toBe(true);
  });

  it('holds digest-timed notices until the digest time', async () => {
    await school.admin.put('/automation-rules/calendar.published', { enabled: true, timing: 'digest' }).expect(200);
    await school.admin.post('/calendar/events', { type: 'ptm', title: 'PTM later', startDate: addDays(today, 6), endDate: addDays(today, 6) }).expect(201);
    const now = new Date();
    await t.runNotifications(now);
    const queued = await deliveries('&status=queued');
    expect(queued.length).toBeGreaterThan(0);
    expect(t.whatsapp.sent.some((m) => m.params.includes('PTM later'))).toBe(false);
    await t.runNotifications(new Date(now.getTime() + 25 * HOUR));
    expect(t.whatsapp.sent.some((m) => m.params.includes('PTM later'))).toBe(true);
    await school.admin.put('/automation-rules/calendar.published', { enabled: true, timing: 'immediate' }).expect(200);
  });
});

describe('retries and SMS fallback (§9.9)', () => {
  it('falls back to SMS when WhatsApp fails permanently', async () => {
    const zara = await admit('Zara', true);
    t.whatsapp.failFor.set(zara.guardianPhone, new SendError('Recipient is not on WhatsApp', true));
    await setAbsent(...[riya, kabir, meera].filter((s) => absentToday.has(s.id)), zara);
    await t.runNotifications();
    await t.runNotifications();
    const mine = (await deliveries('&eventType=attendance.absent')).filter((d) => d.toAddress === zara.guardianPhone);
    expect(mine.map((d) => `${d.channel}:${d.status}`).sort()).toEqual(['sms:sent', 'whatsapp:failed']);
    expect(t.sms.texts.some((m) => m.phone === zara.guardianPhone && m.text.includes('Zara'))).toBe(true);
  });

  it('retries temporary failures with backoff', async () => {
    const ivan = await admit('Ivan', true);
    t.whatsapp.failFor.set(ivan.guardianPhone, new SendError('Rate limited', false));
    await setAbsent(...[riya, kabir, meera].filter((s) => absentToday.has(s.id)), ivan);
    const now = new Date();
    await t.runNotifications(now);
    let mine = (await deliveries()).filter((d) => d.toAddress === ivan.guardianPhone);
    expect(mine[0]).toMatchObject({ status: 'queued', attempts: 1, error: 'Rate limited' });
    t.whatsapp.failFor.delete(ivan.guardianPhone);
    await t.runNotifications(new Date(now.getTime() + 3 * 60_000));
    mine = (await deliveries()).filter((d) => d.toAddress === ivan.guardianPhone);
    expect(mine[0]).toMatchObject({ status: 'sent', attempts: 2 });
  });
});

describe('delivery receipts (COM-08)', () => {
  const sign = (body: string, secret = 'test-whatsapp-app-secret') => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  const receipt = (id: string, status: string) =>
    JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id, status, timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }] });

  it('applies signed receipts and never moves a message backwards', async () => {
    const ref = t.whatsapp.to(riya.guardianPhone)[0]!.ref;
    for (const status of ['delivered', 'read', 'delivered']) {
      const body = receipt(ref, status);
      await t.http.post('/webhooks/whatsapp').set('content-type', 'application/json').set('x-hub-signature-256', sign(body)).send(body).expect(200);
    }
    const mine = (await deliveries('&eventType=attendance.absent')).find((d) => d.toAddress === riya.guardianPhone);
    expect(mine).toMatchObject({ status: 'read' });
    expect(mine?.readAt).not.toBeNull();
  });

  it('rejects unsigned or wrongly signed webhooks and answers the handshake', async () => {
    const body = receipt('x', 'read');
    await t.http.post('/webhooks/whatsapp').set('content-type', 'application/json').set('x-hub-signature-256', sign(body, 'wrong')).send(body).expect(403);
    await t.http.post('/webhooks/whatsapp').set('content-type', 'application/json').send(body).expect(403);
    const res = await t.http.get('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=12345').expect(200);
    expect(res.text).toBe('12345');
    await t.http.get('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1').expect(403);
  });
});

describe('quota (PLT-04)', () => {
  it('stops WhatsApp at the plan quota, falls back to SMS and flags the organization', async () => {
    const [inst] = await t.system.select({ orgId: institutes.organizationId }).from(institutes).where(eq(institutes.id, school.instituteId));
    const [tiny] = await t.system.insert(plans).values({ code: `tiny-${Date.now()}`, name: 'Tiny', pricePerStudent: '0', messageQuota: 1 }).returning({ id: plans.id });
    await t.system.update(organizations).set({ planId: tiny!.id }).where(eq(organizations.id, inst!.orgId));

    const quinn = await admit('Quinn', true);
    await setAbsent(...[riya, kabir, meera].filter((s) => absentToday.has(s.id)), quinn);
    await t.runNotifications();
    await t.runNotifications();
    const mine = (await deliveries()).filter((d) => d.toAddress === quinn.guardianPhone);
    expect(mine.map((d) => `${d.channel}:${d.status}`).sort()).toEqual(['sms:sent', 'whatsapp:failed']);
    expect(mine.find((d) => d.channel === 'whatsapp')?.error).toContain('quota');

    const usage = await t.as(await t.platformAdmin()).get(`/platform/usage?month=${today.slice(0, 7)}`).expect(200);
    expect(usage.body.find((o: { id: string }) => o.id === inst!.orgId)).toMatchObject({ quota: 1, alert: 'exceeded' });
    const own = await school.admin.get(`/messages/usage?month=${today.slice(0, 7)}`).expect(200);
    expect(own.body.whatsappQuota).toBe(1);
  });
});

describe('engine helpers', () => {
  it('converts local digest times to UTC', () => {
    expect(zonedTimeToUtc('2026-11-02', '16:00', 'Asia/Kolkata').toISOString()).toBe('2026-11-02T10:30:00.000Z');
    // New York changes clocks on 2026-11-01.
    expect(zonedTimeToUtc('2026-11-02', '16:00', 'America/New_York').toISOString()).toBe('2026-11-02T21:00:00.000Z');
    expect(nextLocalTime(new Date('2026-11-02T11:00:00Z'), '16:00', 'Asia/Kolkata').toISOString()).toBe('2026-11-03T10:30:00.000Z');
  });

  it('renders templates with language fallback', () => {
    expect(renderTemplate('student_absent', 'ta', { studentName: 'A', date: '2 Nov', instituteName: 'S' })).toContain('Dear parent, A');
    for (const template of Object.values(MESSAGE_TEMPLATES)) expect(template.bodies.en).toBeTruthy();
  });

  it('calls the WhatsApp Cloud API correctly and classifies errors', async () => {
    const calls: { url: string; body: any }[] = [];
    const fakeFetch = (status: number, body: object) =>
      (async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(init.body as string) });
        return new Response(JSON.stringify(body), { status });
      }) as unknown as typeof fetch;
    const config = { WHATSAPP_TOKEN: 'tok', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_GRAPH_VERSION: 'v23.0' };
    const msg = { to: '+919876543210', template: 'student_absent_v1', language: 'en', params: ['Riya\nSharma', '2 Nov', 'School'], text: '' };

    const ok = await new MetaWhatsAppSender(config, fakeFetch(200, { messages: [{ id: 'wamid.1' }] })).send(msg);
    expect(ok).toBe('wamid.1');
    expect(calls[0]!.url).toBe('https://graph.facebook.com/v23.0/123/messages');
    expect(calls[0]!.body).toMatchObject({ to: '919876543210', type: 'template', template: { name: 'student_absent_v1', language: { code: 'en' } } });
    expect(calls[0]!.body.template.components[0].parameters[0].text).toBe('Riya Sharma');

    await expect(new MetaWhatsAppSender(config, fakeFetch(400, { error: { message: 'bad' } })).send(msg)).rejects.toMatchObject({ permanent: true });
    await expect(new MetaWhatsAppSender(config, fakeFetch(503, {})).send(msg)).rejects.toMatchObject({ permanent: false });
    await expect(new MetaWhatsAppSender(config, fakeFetch(429, {})).send(msg)).rejects.toMatchObject({ permanent: false });
  });
});
