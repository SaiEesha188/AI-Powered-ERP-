// Fills the demo school (pnpm db:seed) with a believable week: past attendance, homework,
// a holiday, a PTM and a consent circular. Today's attendance is left for the teacher.
// Usage: API_LOG=<path to the API's log> node scripts/demo-activity.mjs
import { readFileSync } from 'node:fs';

const API = 'http://localhost:3000';
const log = process.env.API_LOG;
if (!log) throw new Error('Set API_LOG to the API log file (OTP codes are printed there)');

async function call(token, instituteId, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-institute-id': instituteId },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}

async function signIn(phone) {
  await fetch(`${API}/auth/otp/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone }) });
  await new Promise((r) => setTimeout(r, 400));
  const code = [...readFileSync(log, 'utf8').matchAll(new RegExp(`OTP for \\${phone}: (\\d{6})`, 'g'))].at(-1)?.[1];
  const tokens = await (await fetch(`${API}/auth/otp/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, code }) })).json();
  const me = await (await fetch(`${API}/me`, { headers: { authorization: `Bearer ${tokens.accessToken}` } })).json();
  const instituteId = me.memberships[0].instituteId;
  return (method, path, body) => call(tokens.accessToken, instituteId, method, path, body);
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const shift = (days) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const admin = await signIn('+919000000002');
const teacher = await signIn('+919000000004');

const sections = await admin('GET', '/sections');
const sectionA = sections.find((s) => s.name === 'A');
const roster = await admin('GET', `/attendance/sections/${sectionA.id}?date=${today}`);
const [aarav, isha, rohan] = roster.students;

// The last five school days, with a few absences, entered by the office as a back-fill.
let filled = 0;
for (let back = 1; filled < 5 && back < 14; back++) {
  const date = shift(-back);
  const day = await admin('GET', `/calendar/events/day-status?date=${date}&classId=${sectionA.classId}`);
  if (!day.working) continue;
  const records = [];
  if (back === 1) records.push({ studentId: rohan.studentId, status: 'absent' });
  if (back === 2) records.push({ studentId: aarav.studentId, status: 'late' });
  if (back === 4) records.push({ studentId: rohan.studentId, status: 'absent' }, { studentId: isha.studentId, status: 'leave' });
  await admin('PUT', `/attendance/sections/${sectionA.id}`, { date, records, reason: 'Back-filled from the paper register' });
  filled += 1;
}

const teaching = await teacher('GET', '/me/teaching');
const mine = teaching.sections.find((s) => s.id === sectionA.id);
const [maths, science] = mine.mySubjects;
await teacher('POST', '/homework', { sectionIds: [sectionA.id], subjectId: maths.id, title: 'Exercise 3.2 — questions 1 to 10', instructions: 'Show each step. Use a ruler for the number line.', dueDate: shift(1) });
await teacher('POST', '/homework', { sectionIds: [sectionA.id], subjectId: science.id, title: 'Draw and label a plant cell', instructions: 'A4 sheet, coloured pencils.', dueDate: shift(3) });

await admin('POST', '/calendar/events', { type: 'holiday', title: 'Guru Nanak Jayanti', startDate: shift(6), endDate: shift(6) });
await admin('POST', '/calendar/events', { type: 'ptm', title: 'Parent–teacher meeting', description: '9 AM to 12 noon, classrooms.', startDate: shift(10), endDate: shift(10) });
await admin('POST', '/circulars', {
  title: 'Science centre visit — consent needed',
  body: 'Class 8 will visit the Regional Science Centre next Friday. The bus leaves at 8:30 AM and returns by 2 PM. Please confirm that your child may attend.',
  requiresAck: true,
  audiences: [{ type: 'parents' }],
  publish: true,
});
console.log(`Demo activity added: ${filled} days of attendance, 2 homework, a holiday, a PTM and a circular.`);
