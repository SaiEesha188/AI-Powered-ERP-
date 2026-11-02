// Students, guardians, enrollment, bulk import and parent "own children" access (M05, CFG-07).
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normaliseDate, normalisePhone, parseCsv } from '../src/students/student-import.js';
import { createTestApp, type TestApp, uniquePhone } from './helpers.js';

let t: TestApp;
let school: Awaited<ReturnType<TestApp['setupSchool']>>;
const mother = uniquePhone();
let riya: { id: string; admissionNo: string };
let kabir: { id: string };

beforeAll(async () => {
  t = await createTestApp();
  school = await t.setupSchool();
});
afterAll(() => t.close());

describe('admission (STU-02..05)', () => {
  it('admits a student with guardians and enrolls them', async () => {
    const res = await school.admin
      .post('/students', {
        name: 'Riya Sharma',
        dob: '2013-05-14',
        gender: 'female',
        sectionId: school.sectionA,
        rollNo: 7,
        guardians: [
          { name: 'Pooja Sharma', phone: mother, relation: 'mother', whatsappOptIn: true, language: 'hi' },
          { name: 'Vikram Sharma', phone: uniquePhone(), relation: 'father' },
        ],
      })
      .expect(201);
    riya = res.body;
    expect(res.body).toMatchObject({ name: 'Riya Sharma', admissionNo: '1', status: 'active' });
    // Without an explicit primary, the first guardian becomes primary.
    expect(res.body.guardians.find((g: { name: string }) => g.name === 'Pooja Sharma')).toMatchObject({ isPrimary: true, whatsappOptIn: true, language: 'hi' });
    expect(res.body.enrollments).toEqual([expect.objectContaining({ sectionId: school.sectionA, className: 'Class 8', rollNo: 7, isCurrentYear: true })]);
  });

  it('links siblings through a shared guardian and numbers admissions', async () => {
    const res = await school.admin
      .post('/students', { name: 'Kabir Sharma', sectionId: school.sectionB, guardians: [{ name: 'Pooja Sharma', phone: mother, relation: 'mother' }] })
      .expect(201);
    kabir = res.body;
    expect(res.body.admissionNo).toBe('2');
    expect(res.body.siblings).toEqual([expect.objectContaining({ id: riya.id, name: 'Riya Sharma' })]);
    // One person, one guardian row: the mother's opt-in and language carry over.
    expect(res.body.guardians[0]).toMatchObject({ whatsappOptIn: true, language: 'hi' });
  });

  it('rejects duplicates and bad input', async () => {
    const dup = { name: 'Dup', admissionNo: riya.admissionNo, guardians: [{ name: 'X Y', phone: uniquePhone(), relation: 'father' }] };
    await school.admin.post('/students', dup).expect(409);
    await school.admin.post('/students', { name: 'No Guardian', guardians: [] }).expect(400);
    const samePhone = uniquePhone();
    await school.admin
      .post('/students', {
        name: 'Same Phone',
        guardians: [
          { name: 'A B', phone: samePhone, relation: 'mother' },
          { name: 'C D', phone: samePhone, relation: 'father' },
        ],
      })
      .expect(400);
    await school.admin.post('/students', { name: 'Roll Clash', sectionId: school.sectionA, rollNo: 7, guardians: [{ name: 'E F', phone: uniquePhone(), relation: 'other' }] }).expect(409);
  });

  it('lists and searches students with their current section', async () => {
    const inA = await school.admin.get(`/students?sectionId=${school.sectionA}`).expect(200);
    expect(inA.body.map((s: { name: string }) => s.name)).toEqual(['Riya Sharma']);
    const search = await school.admin.get('/students?q=sharma').expect(200);
    expect(search.body).toHaveLength(2);
    expect(search.body[0]).toMatchObject({ className: 'Class 8', sectionName: 'A', rollNo: 7 });
  });

  it('moves a student between sections and auto-numbers rolls by name', async () => {
    await t.admitStudent(school.admin, { name: 'Aarav Mehta', sectionId: school.sectionB });
    await school.admin.put(`/students/${kabir.id}/enrollment`, { sectionId: school.sectionA }).expect(200);
    const res = await school.admin.post(`/sections/${school.sectionA}/roll-numbers/auto`).expect(200);
    expect(res.body.numbered).toBe(2);
    const list = await school.admin.get(`/students?sectionId=${school.sectionA}`).expect(200);
    expect(list.body.map((s: { name: string; rollNo: number }) => `${s.rollNo}:${s.name}`)).toEqual(['1:Kabir Sharma', '2:Riya Sharma']);
  });
});

describe('guardians', () => {
  it('updates opt-in for the person and keeps one primary', async () => {
    const detail = await school.admin.get(`/students/${riya.id}`).expect(200);
    const father = detail.body.guardians.find((g: { relation: string }) => g.relation === 'father');
    const res = await school.admin.patch(`/students/${riya.id}/guardians/${father.guardianId}`, { isPrimary: true, whatsappOptIn: true }).expect(200);
    expect(res.body.guardians.filter((g: { isPrimary: boolean }) => g.isPrimary).map((g: { relation: string }) => g.relation)).toEqual(['father']);
  });

  it('refuses to remove the last guardian, and removing one revokes their parent access', async () => {
    const solo = await t.admitStudent(school.admin, { name: 'Solo Child' });
    await school.admin.delete(`/students/${solo.id}/guardians/${solo.guardians[0]!.guardianId}`).expect(409);

    const extraPhone = uniquePhone();
    const withExtra = await school.admin.post(`/students/${solo.id}/guardians`, { name: 'Uncle Joe', phone: extraPhone, relation: 'guardian' }).expect(201);
    const uncle = withExtra.body.guardians.find((g: { name: string }) => g.name === 'Uncle Joe');
    const { accessToken } = await t.login(extraPhone);
    await t.as(accessToken, school.instituteId).get('/family/children').expect(200);

    await school.admin.delete(`/students/${solo.id}/guardians/${uncle.guardianId}`).expect(204);
    await t.as(accessToken, school.instituteId).get('/family/children').expect(403);
  });
});

describe('parent access to own children only', () => {
  it('shows a parent all their children and nothing else', async () => {
    const { accessToken } = await t.login(mother);
    const parent = t.as(accessToken, school.instituteId);
    const res = await parent.get('/family/children').expect(200);
    expect(res.body.map((c: { name: string; sectionName: string }) => `${c.name} ${c.sectionName}`)).toEqual(['Kabir Sharma A', 'Riya Sharma A']);
    await parent.get('/students').expect(403);
    await parent.get(`/students/${riya.id}`).expect(403);
    await parent.get('/staff').expect(403);
  });

  it('gives another parent none of these children', async () => {
    const other = await t.admitStudent(school.admin, { name: 'Other Child', sectionId: school.sectionB });
    const { accessToken } = await t.login(other.guardianPhone);
    const res = await t.as(accessToken, school.instituteId).get('/family/children').expect(200);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Other Child']);
  });
});

describe('bulk import (CFG-07)', () => {
  const header = 'admission_no,name,dob,gender,class,section,roll_no,guardian_name,guardian_phone,guardian_relation,guardian_whatsapp_opt_in';

  it('reports every problem with its row and imports nothing', async () => {
    const csv = [
      header,
      'A100,Good Row,14/05/2013,F,Class 8,B,20,Asha Rao,98765 43210,mother,yes',
      'A100,Duplicate No,,M,Class 8,B,,Ravi Rao,9876543211,father,',
      'A102,Bad Phone,,M,Class 8,B,,Ravi Rao,12345,father,',
      'A103,Bad Section,31/02/2013,X,Class 9,Z,,Mina,9876543212,aunt,',
    ].join('\n');
    const dry = await school.admin.upload('/students/import?dryRun=true', Buffer.from(csv), 'students.csv').expect(200);
    expect(dry.body).toMatchObject({ total: 4, valid: 1, imported: 0, dryRun: true });
    const problems = dry.body.errors.map((e: { row: number; column: string }) => `${e.row}:${e.column}`);
    expect(problems).toEqual(['3:admission_no', '4:guardian_phone', '5:dob', '5:gender', '5:section', '5:guardian_relation']);
    expect(dry.body.errorCsv.split('\n')[0]).toBe('row,column,message');

    await school.admin.upload('/students/import', Buffer.from(csv), 'students.csv').expect(422);
    const after = await school.admin.get('/students?q=Good Row').expect(200);
    expect(after.body).toEqual([]);
  });

  it('imports a clean CSV, linking guardians by phone', async () => {
    const csv = [
      header,
      `B200,"Sen, Ananya",2013-01-02,female,class 8,b,21,Rita Sen,09876543220,mother,Y`,
      `B201,Ishaan Sen,,male,Class 8,B,22,Rita Sen,+919876543220,mother,`,
    ].join('\r\n');
    const res = await school.admin.upload('/students/import', Buffer.from(csv), 'students.csv').expect(200);
    expect(res.body).toMatchObject({ total: 2, valid: 2, imported: 2, errors: [] });
    const list = await school.admin.get('/students?q=Sen').expect(200);
    const ananya = list.body.find((s: { name: string }) => s.name === 'Sen, Ananya');
    const detail = await school.admin.get(`/students/${ananya.id}`).expect(200);
    expect(detail.body.guardians[0]).toMatchObject({ phone: '+919876543220', whatsappOptIn: true });
    expect(detail.body.siblings.map((s: { name: string }) => s.name)).toEqual(['Ishaan Sen']);
  });

  it('imports an Excel workbook', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Students');
    ws.addRow(['Name', 'DOB', 'Class', 'Section', 'Guardian Name', 'Guardian Phone']);
    ws.addRow(['Excel Kid', new Date(Date.UTC(2014, 2, 3)), 'Class 8', 'A', 'Excel Parent', 9876543230]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await school.admin.upload('/students/import', buffer, 'students.xlsx').expect(200);
    expect(res.body).toMatchObject({ imported: 1, errors: [] });
    const list = await school.admin.get('/students?q=Excel Kid').expect(200);
    expect(list.body[0]).toMatchObject({ sectionName: 'A' });
  });

  it('rejects other file types and teachers', async () => {
    await school.admin.upload('/students/import', Buffer.from('x'), 'students.txt').expect(400);
    const teacher = await t.addMember(school.adminToken, school.instituteId, ['teacher']);
    await t.as(teacher.token, school.instituteId).upload('/students/import', Buffer.from(header), 'students.csv').expect(403);
  });
});

describe('import parsing helpers', () => {
  it('normalises Indian phone formats', () => {
    expect(normalisePhone('98765 43210')).toBe('+919876543210');
    expect(normalisePhone('09876543210')).toBe('+919876543210');
    expect(normalisePhone('919876543210')).toBe('+919876543210');
    expect(normalisePhone('+14155550123')).toBe('+14155550123');
    expect(normalisePhone('12345')).toBeNull();
  });

  it('accepts ISO and day-first dates and rejects impossible ones', () => {
    expect(normaliseDate('2013-5-4')).toBe('2013-05-04');
    expect(normaliseDate('04/05/2013')).toBe('2013-05-04');
    expect(normaliseDate('31-02-2013')).toBeNull();
  });

  it('parses quoted CSV fields', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });
});
