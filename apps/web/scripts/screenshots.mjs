// Visual QA: signs in as a demo user and captures pages at desktop and phone sizes.
// Usage: node scripts/screenshots.mjs <phone> <experience> <route>[,<route>...] [desktop|mobile|both]
// Needs the API (:3000, with its log at $API_LOG) and the web app (:3001) running.
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const [phone, experience, routesArg, sizes = 'both'] = process.argv.slice(2);
if (!phone || !experience || !routesArg) {
  console.error('Usage: node scripts/screenshots.mjs <phone> <admin|teacher|parent> <routes> [desktop|mobile|both]');
  process.exit(1);
}
const API = 'http://localhost:3000';
const WEB = 'http://localhost:3001';
const log = process.env.API_LOG;

async function post(path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function signIn() {
  await post('/auth/otp/request', { phone });
  await new Promise((r) => setTimeout(r, 400));
  const codes = [...readFileSync(log, 'utf8').matchAll(new RegExp(`OTP for \\${phone}: (\\d{6})`, 'g'))];
  const code = codes.at(-1)?.[1];
  if (!code) throw new Error('OTP not found in API log');
  const tokens = await post('/auth/otp/verify', { phone, code });
  const me = await (await fetch(`${API}/me`, { headers: { authorization: `Bearer ${tokens.accessToken}` } })).json();
  // Platform admins have no institute.
  return { ...tokens, instituteId: me.memberships[0]?.instituteId, experience };
}

const session = await signIn();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const viewports = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
await mkdir('screenshots', { recursive: true });
for (const size of sizes === 'both' ? ['desktop', 'mobile'] : [sizes]) {
  const context = await browser.newContext({ ...viewports[size], colorScheme: process.env.SCHEME ?? 'light' });
  await context.addInitScript((s) => localStorage.setItem('erp.session', JSON.stringify(s)), session);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`[${size}] page error:`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.error(`[${size}] console:`, m.text()));
  for (const route of routesArg.split(',')) {
    await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const file = `screenshots/${experience}${route.replace(/[/?=&]+/g, '_') || '_home'}-${size}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  }
  await context.close();
}
await browser.close();
