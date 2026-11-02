// Usage (from the repo root): pnpm db:seed
// Creates a platform admin and a demo school (current year, Class 8, teachers, students and
// parents) so every app flow can be tried. Idempotent: existing data is left alone.
import { and, eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { createDb, type Tx } from '../client.js';
import { assignRole, findOrCreateUserByPhone, provisionTenant } from '../provisioning.js';
import {
  academicYears,
  classes,
  classSubjects,
  enrollments,
  guardians,
  institutes,
  sections,
  staff,
  studentGuardians,
  students,
  subjects,
  teacherAssignments,
  users,
} from '../schema/index.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const url = process.env.SYSTEM_DATABASE_URL;
if (!url) throw new Error('SYSTEM_DATABASE_URL is not set (see .env.example)');

const shift = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Class 8 with two sections, two subjects, a class teacher and three students. */
async function seedSchool(tx: Tx, instituteId: string) {
  const [existing] = await tx.select({ id: classes.id }).from(classes).where(eq(classes.instituteId, instituteId)).limit(1);
  if (existing) return;

  const [year] = await tx
    .insert(academicYears)
    .values({ instituteId, name: 'Current year', startDate: shift(-150), endDate: shift(215), isCurrent: true })
    .returning({ id: academicYears.id });
  const [class8] = await tx.insert(classes).values({ instituteId, name: 'Class 8', level: 8 }).returning({ id: classes.id });
  const subjectRows = await tx
    .insert(subjects)
    .values([
      { instituteId, name: 'Mathematics', code: 'MATH' },
      { instituteId, name: 'Science', code: 'SCI' },
    ])
    .returning({ id: subjects.id, code: subjects.code });
  await tx.insert(classSubjects).values(subjectRows.map((s) => ({ instituteId, classId: class8!.id, subjectId: s.id, periodsPerWeek: 6 })));

  const teacher = await findOrCreateUserByPhone(tx, { phone: '+919000000004', name: 'Ravi Teacher' });
  await assignRole(tx, { instituteId, userId: teacher.id, roleCode: 'class_teacher' });
  const [teacherStaff] = await tx
    .insert(staff)
    .values({ instituteId, userId: teacher.id, employeeCode: 'T001', designation: 'TGT Mathematics' })
    .returning({ id: staff.id });
  const sectionRows = await tx
    .insert(sections)
    .values([
      { instituteId, classId: class8!.id, academicYearId: year!.id, name: 'A', classTeacherId: teacherStaff!.id },
      { instituteId, classId: class8!.id, academicYearId: year!.id, name: 'B' },
    ])
    .returning({ id: sections.id, name: sections.name });
  const sectionA = sectionRows.find((s) => s.name === 'A')!.id;
  for (const s of subjectRows) await tx.insert(teacherAssignments).values({ instituteId, staffId: teacherStaff!.id, sectionId: sectionA, subjectId: s.id });

  const family = [
    { name: 'Aarav Mehta', admissionNo: '1', roll: 1, parent: { name: 'Meena Mehta', phone: '+919000000005', optIn: true } },
    { name: 'Isha Mehta', admissionNo: '2', roll: 2, parent: { name: 'Meena Mehta', phone: '+919000000005', optIn: true } },
    { name: 'Rohan Das', admissionNo: '3', roll: 3, parent: { name: 'Sunil Das', phone: '+919000000006', optIn: false } },
  ];
  for (const f of family) {
    const [student] = await tx.insert(students).values({ instituteId, admissionNo: f.admissionNo, name: f.name }).returning({ id: students.id });
    const parent = await findOrCreateUserByPhone(tx, f.parent);
    await tx.insert(guardians).values({ instituteId, userId: parent.id, whatsappOptIn: f.parent.optIn }).onConflictDoNothing();
    const [guardian] = await tx.select({ id: guardians.id }).from(guardians).where(and(eq(guardians.instituteId, instituteId), eq(guardians.userId, parent.id)));
    await tx.insert(studentGuardians).values({ instituteId, studentId: student!.id, guardianId: guardian!.id, relation: 'mother', isPrimary: true });
    await assignRole(tx, { instituteId, userId: parent.id, roleCode: 'parent' });
    await tx.insert(enrollments).values({ instituteId, studentId: student!.id, sectionId: sectionA, academicYearId: year!.id, rollNo: f.roll });
  }
}

const { db, pool } = createDb(url, { max: 1 });
try {
  await db.transaction(async (tx) => {
    const platformAdmin = await findOrCreateUserByPhone(tx, { phone: '+919000000001', name: 'Platform Admin' });
    await tx.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, platformAdmin.id));

    const [existing] = await tx.select({ id: institutes.id }).from(institutes).where(eq(institutes.subdomain, 'demo'));
    const instituteId =
      existing?.id ??
      (
        await provisionTenant(tx, {
          organization: { name: 'Demo Education Trust', type: 'trust' },
          institute: { name: 'Demo Public School', vertical: 'school', board: 'CBSE', subdomain: 'demo' },
          planCode: 'standard',
          seats: 500,
          admin: { name: 'Office Admin', phone: '+919000000002' },
        })
      ).instituteId;

    const principal = await findOrCreateUserByPhone(tx, { phone: '+919000000003', name: 'Asha Principal' });
    await assignRole(tx, { instituteId, userId: principal.id, roleCode: 'principal' });
    await seedSchool(tx, instituteId);
  });
  console.log(`Demo data ready. Sign in with OTP (printed in the API log) as:
  +919000000001  platform admin
  +919000000002  institute admin (office)
  +919000000003  principal
  +919000000004  class teacher of 8-A (Maths, Science)
  +919000000005  parent of Aarav and Isha (WhatsApp)
  +919000000006  parent of Rohan (SMS)`);
} finally {
  await pool.end();
}
