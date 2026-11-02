import { eq, findOrCreateUserByPhone, users } from '@erp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/crypto.js';
import { createTestApp, type TestApp, uniquePhone } from './helpers.js';

let t: TestApp;
let registeredPhone: string;

beforeAll(async () => {
  t = await createTestApp();
  registeredPhone = uniquePhone();
  await findOrCreateUserByPhone(t.system, { phone: registeredPhone, name: 'Registered User' });
});
afterAll(() => t.close());

describe('OTP login', () => {
  it('answers the same for unknown numbers but sends nothing', async () => {
    const phone = uniquePhone();
    const res = await t.http.post('/auth/otp/request').send({ phone }).expect(202);
    expect(res.body.message).toMatch(/If this number is registered/);
    expect(t.sms.sent.some((m) => m.phone === phone)).toBe(false);
  });

  it('rejects malformed phone numbers', async () => {
    await t.http.post('/auth/otp/request').send({ phone: '9876543210' }).expect(400);
  });

  it('signs in with a valid code and the code works only once', async () => {
    await t.http.post('/auth/otp/request').send({ phone: registeredPhone }).expect(202);
    const code = t.sms.lastCode(registeredPhone);
    const res = await t.http.post('/auth/otp/verify').send({ phone: registeredPhone, code }).expect(200);
    expect(res.body).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String), expiresIn: 900 });

    const me = await t.as(res.body.accessToken).get('/me').expect(200);
    expect(me.body.user.phone).toBe(registeredPhone);

    await t.http.post('/auth/otp/verify').send({ phone: registeredPhone, code }).expect(401);
  });

  it('locks a code after five wrong attempts', async () => {
    const phone = uniquePhone();
    await findOrCreateUserByPhone(t.system, { phone, name: 'Guesser' });
    await t.http.post('/auth/otp/request').send({ phone }).expect(202);
    const code = t.sms.lastCode(phone);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await t.http.post('/auth/otp/verify').send({ phone, code: wrong }).expect(401);
    await t.http.post('/auth/otp/verify').send({ phone, code }).expect(401);
  });

  it('rate-limits code requests per number', async () => {
    const phone = uniquePhone();
    await findOrCreateUserByPhone(t.system, { phone, name: 'Spammer' });
    for (let i = 0; i < 5; i++) await t.http.post('/auth/otp/request').send({ phone }).expect(202);
    await t.http.post('/auth/otp/request').send({ phone }).expect(429);
  });
});

describe('sessions', () => {
  it('requires a token on protected routes', async () => {
    await t.http.get('/me').expect(401);
    await t.http.get('/me').set('authorization', 'Bearer not-a-jwt').expect(401);
  });

  it('rotates refresh tokens and revokes the session when an old one is replayed', async () => {
    const first = await t.login(registeredPhone);
    const second = await t.http.post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200);
    expect(second.body.refreshToken).not.toBe(first.refreshToken);
    await t.as(second.body.accessToken).get('/me').expect(200);

    // Replaying the rotated token looks like theft: the whole session ends.
    await t.http.post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    await t.as(second.body.accessToken).get('/me').expect(401);
    await t.http.post('/auth/refresh').send({ refreshToken: second.body.refreshToken }).expect(401);
  });

  it('logout ends the session immediately', async () => {
    const { accessToken } = await t.login(registeredPhone);
    await t.as(accessToken).post('/auth/logout').expect(204);
    await t.as(accessToken).get('/me').expect(401);
  });

  it('lists devices and can sign out another device (USR-07)', async () => {
    const laptop = await t.login(registeredPhone);
    const phone = await t.login(registeredPhone);
    const list = await t.as(laptop.accessToken).get('/auth/sessions').expect(200);
    const other = list.body.find((s: { id: string }) => phone.refreshToken.startsWith(s.id));
    expect(other).toMatchObject({ current: false });
    await t.as(laptop.accessToken).delete(`/auth/sessions/${other.id}`).expect(204);
    await t.as(phone.accessToken).get('/me').expect(401);
    await t.as(laptop.accessToken).get('/me').expect(200);
  });

  it('blocks a disabled user even with a valid token', async () => {
    const phone = uniquePhone();
    const user = await findOrCreateUserByPhone(t.system, { phone, name: 'Leaver' });
    const { accessToken } = await t.login(phone);
    await t.system.update(users).set({ status: 'disabled' }).where(eq(users.id, user.id));
    await t.as(accessToken).get('/me').expect(401);
  });
});

describe('password login', () => {
  it('accepts email + password and rejects a wrong password with the same message', async () => {
    const email = `owner${Date.now()}@example.com`;
    const user = await findOrCreateUserByPhone(t.system, { phone: uniquePhone(), name: 'Owner' });
    await t.system
      .update(users)
      .set({ email, passwordHash: await hashPassword('correct horse battery') })
      .where(eq(users.id, user.id));

    await t.http.post('/auth/password/login').send({ identifier: email.toUpperCase(), password: 'correct horse battery' }).expect(200);
    const wrong = await t.http.post('/auth/password/login').send({ identifier: email, password: 'wrong password' }).expect(401);
    const unknown = await t.http
      .post('/auth/password/login')
      .send({ identifier: 'nobody@example.com', password: 'wrong password' })
      .expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });
});
