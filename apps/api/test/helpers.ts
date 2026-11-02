import 'reflect-metadata';
import { createDb, eq, findOrCreateUserByPhone, users } from '@erp/db';
import type { CreateTenantInput } from '@erp/shared';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect, inject } from 'vitest';
import { AppModule, configureApp } from '../src/app.module.js';
import { SmsSender } from '../src/auth/sms.js';
import { NotificationEngine } from '../src/notifications/engine.js';
import { SendError, type WhatsAppMessage, WhatsAppSender } from '../src/notifications/whatsapp.js';
import { addDays, localDate } from '../src/common/institute.js';

export class CapturingSms extends SmsSender {
  readonly sent: { phone: string; code: string }[] = [];
  readonly texts: { phone: string; text: string }[] = [];

  async sendOtp(phone: string, code: string) {
    this.sent.push({ phone, code });
  }

  async sendText(phone: string, text: string) {
    this.texts.push({ phone, text });
    return `sms-${this.texts.length}`;
  }

  lastCode(phone: string) {
    const msg = this.sent.findLast((m) => m.phone === phone);
    if (!msg) throw new Error(`no OTP sent to ${phone}`);
    return msg.code;
  }
}

/** Records WhatsApp sends; set failFor[phone] to simulate provider errors. */
export class CapturingWhatsApp extends WhatsAppSender {
  readonly sent: (WhatsAppMessage & { ref: string })[] = [];
  readonly failFor = new Map<string, SendError>();

  async send(message: WhatsAppMessage) {
    const error = this.failFor.get(message.to);
    if (error) throw error;
    const ref = `wamid.${this.sent.length + 1}.${Math.random().toString(36).slice(2)}`;
    this.sent.push({ ...message, ref });
    return ref;
  }

  to(phone: string) {
    return this.sent.filter((m) => m.to === phone);
  }
}

let counter = 0;
/** A phone number no other test uses. */
export function uniquePhone() {
  counter += 1;
  const n = `${process.pid % 1000}${Date.now() % 100000}${counter}`.padStart(9, '0').slice(-9);
  return `+918${n}`;
}

export async function createTestApp() {
  const env = inject('testEnv');
  Object.assign(process.env, env);
  const sms = new CapturingSms();
  const whatsapp = new CapturingWhatsApp();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SmsSender)
    .useValue(sms)
    .overrideProvider(WhatsAppSender)
    .useValue(whatsapp)
    .compile();
  const app: INestApplication = configureApp(moduleRef.createNestApplication({ logger: false, rawBody: true }));
  await app.init();
  const system = createDb(env.SYSTEM_DATABASE_URL!, { max: 2 });
  const http = request(app.getHttpServer());

  /** Requests as a signed-in user, optionally inside an institute. */
  const as = (token: string, instituteId?: string) => {
    const headers = (r: request.Test) => {
      r.set('authorization', `Bearer ${token}`);
      if (instituteId) r.set('x-institute-id', instituteId);
      return r;
    };
    return {
      get: (url: string) => headers(http.get(url)),
      post: (url: string, body?: object) => headers(http.post(url)).send(body ?? {}),
      patch: (url: string, body: object) => headers(http.patch(url)).send(body),
      put: (url: string, body: object) => headers(http.put(url)).send(body),
      delete: (url: string) => headers(http.delete(url)),
      upload: (url: string, buffer: Buffer, filename: string) => headers(http.post(url)).attach('file', buffer, filename),
    };
  };

  async function login(phone: string) {
    await http.post('/auth/otp/request').send({ phone }).expect(202);
    const res = await http.post('/auth/otp/verify').send({ phone, code: sms.lastCode(phone) }).expect(200);
    return res.body as { accessToken: string; refreshToken: string };
  }

  async function platformAdmin() {
    const phone = uniquePhone();
    const user = await findOrCreateUserByPhone(system.db, { phone, name: 'Platform Admin' });
    await system.db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, user.id));
    return (await login(phone)).accessToken;
  }

  /** Provisions a tenant and signs in its admin. */
  async function createTenant(platformToken: string, overrides: Partial<CreateTenantInput['institute']> = {}) {
    const adminPhone = uniquePhone();
    const subdomain = `t${Date.now().toString(36)}${(counter++).toString(36)}`;
    const res = await as(platformToken)
      .post('/platform/tenants', {
        organization: { name: `Org ${subdomain}`, type: 'trust' },
        institute: { name: `School ${subdomain}`, vertical: 'school', subdomain, ...overrides },
        planCode: 'standard',
        seats: 100,
        admin: { name: 'Admin', phone: adminPhone },
      })
      .expect(201);
    const { accessToken } = await login(adminPhone);
    return { instituteId: res.body.instituteId as string, adminUserId: res.body.adminUserId as string, adminPhone, adminToken: accessToken };
  }

  /** Adds a user to an institute through the API and signs them in. */
  async function addMember(adminToken: string, instituteId: string, roles: string[]) {
    const phone = uniquePhone();
    const res = await as(adminToken, instituteId).post('/users', { name: 'Member', phone, roles });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { accessToken } = await login(phone);
    return { userId: res.body.userId as string, phone, token: accessToken };
  }

  /** A tenant with a current year around today, Class 8 and sections A and B. */
  async function setupSchool(platformToken?: string) {
    const tenant = await createTenant(platformToken ?? (await platformAdmin()));
    const admin = as(tenant.adminToken, tenant.instituteId);
    // A year around today, so date-sensitive tests (attendance, homework) keep working.
    const today = localDate('Asia/Kolkata');
    const year = await admin.post('/academic-years', { name: 'Current', startDate: addDays(today, -200), endDate: addDays(today, 165) }).expect(201);
    await admin.post(`/academic-years/${year.body.id}/make-current`).expect(200);
    const cls = await admin.post('/classes', { name: 'Class 8', level: 8 }).expect(201);
    const a = await admin.post('/sections', { classId: cls.body.id, name: 'A' }).expect(201);
    const b = await admin.post('/sections', { classId: cls.body.id, name: 'B' }).expect(201);
    return { ...tenant, admin, yearId: year.body.id as string, classId: cls.body.id as string, sectionA: a.body.id as string, sectionB: b.body.id as string };
  }

  /** Admits a student with one guardian (a new phone unless given). */
  async function admitStudent(admin: ReturnType<typeof as>, input: { name: string; sectionId?: string; guardianPhone?: string; rollNo?: number }) {
    const guardianPhone = input.guardianPhone ?? uniquePhone();
    const res = await admin.post('/students', {
      name: input.name,
      sectionId: input.sectionId,
      rollNo: input.rollNo,
      guardians: [{ name: `Parent of ${input.name}`, phone: guardianPhone, relation: 'mother', whatsappOptIn: true }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return { ...res.body, guardianPhone } as { id: string; admissionNo: string; guardianPhone: string; guardians: { guardianId: string; userId: string }[] };
  }

  const engine = app.get(NotificationEngine);

  return {
    app,
    http,
    sms,
    whatsapp,
    /** Runs the notification worker once, optionally pretending it is a later time. */
    runNotifications: (now?: Date) => engine.runOnce(now),
    system: system.db,
    env,
    as,
    login,
    platformAdmin,
    createTenant,
    addMember,
    setupSchool,
    admitStudent,
    close: async () => {
      await app.close();
      await system.pool.end();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
export { SendError };
