// Adds exams to the demo school: a published unit test with report cards, and a mid-term
// in the middle of marks entry. Run after demo-activity.mjs.
// Usage: API_LOG=<path to the API's log> node scripts/demo-exams.mjs
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

const office = await signIn('+919000000002');
const principal = await signIn('+919000000003');
const teacher = await signIn('+919000000004');

// Re-runs start clean: drafts from a failed run are removed.
for (const e of await office('GET', '/exams')) if (e.status === 'draft') await office('DELETE', `/exams/${e.id}`);
const types = await office('GET', '/exams/assessment-types');
const classes = await office('GET', '/classes');
const class8 = classes.find((c) => c.name === 'Class 8');
const sections = await office('GET', '/sections');
const sectionA = sections.find((s) => s.classId === class8.id && s.name === 'A');
const roster = await office('GET', `/attendance/sections/${sectionA.id}?date=${today}`);
const students = roster.students;

// Marks a believable spread per student: first student strong, second steady, third struggling.
const score = (i, max, subjectIndex) => Math.round(max * [0.92, 0.74, 0.41][i % 3] - subjectIndex * 2 * (i % 2));

async function createExam(name, typeName, startOffset, endOffset) {
  const existing = (await office('GET', '/exams')).find((e) => e.name === name);
  if (existing) return office('GET', `/exams/${existing.id}`);
  const start = shift(startOffset);
  const end = shift(endOffset);
  const type = types.find((t) => t.name === typeName);
  const { id } = await office('POST', '/exams', { name, assessmentTypeId: type.id, startDate: start, endDate: end, classIds: [class8.id], defaultMaxMarks: 100, defaultPassMarks: 33 });
  const exam = await office('GET', `/exams/${id}`);
  await Promise.all(exam.papers.map((p, i) => office('PATCH', `/exams/papers/${p.id}`, { date: shift(Math.min(startOffset + i * 2, endOffset)), maxMarks: typeName === 'Unit test' ? 25 : 100, passMarks: typeName === 'Unit test' ? 8 : 33, syllabusScope: i === 0 ? 'Chapters 1 to 4' : 'Chapters 1 to 3' })));
  await office('POST', `/exams/${id}/schedule`);
  return office('GET', `/exams/${id}`);
}

// 1. A unit test from last month, fully published.
const unit = await createExam('Unit Test 1', 'Unit test', -30, -26);
if (!unit.sections.find((s) => s.id === sectionA.id)?.locked) for (const [i, p] of unit.papers.entries()) {
  await teacher('PUT', `/exams/papers/${p.id}/marks`, { sectionId: sectionA.id, entries: students.map((s, j) => ({ studentId: s.studentId, marks: score(j, p.maxMarks, i), absent: false })) });
}
const lock = (who, sectionId) => who('POST', `/exams/${unit.id}/sections/${sectionId}/lock`).catch(() => undefined); // already locked on a re-run
for (const sec of unit.sections) await lock(sec.id === sectionA.id ? teacher : principal, sec.id);
await office('POST', `/exams/${unit.id}/report-cards/generate`);
const cards = await principal('GET', `/exams/${unit.id}/report-cards`);
const remarks = ['Excellent start to the year. Keep the same focus.', 'Steady work; a little more practice in Science will help.', 'Needs regular revision at home. Please meet the class teacher.'];
for (const [i, c] of cards.entries()) await teacher('PATCH', `/report-cards/${c.id}/remarks`, { remarks: remarks[i % remarks.length] });
await principal('POST', `/exams/${unit.id}/report-cards/publish`);

// 2. A mid-term that just finished: one paper entered, the other still pending.
const mid = await createExam('Mid-term Examination', 'Mid-term', -4, -1);
const first = mid.papers[0];
await teacher('PUT', `/exams/papers/${first.id}/marks`, { sectionId: sectionA.id, entries: students.map((s, j) => ({ studentId: s.studentId, marks: j === 2 ? null : score(j, first.maxMarks, 0), absent: j === 2 })) });

console.log(`Demo exams added: "${unit.name}" published with ${cards.length} report cards; "${mid.name}" waiting for marks.`);
