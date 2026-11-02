// Students, guardians and enrollments (M05, ERD 1).
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sections } from './academics.js';
import { users } from './identity.js';
import { institutes, timestamps } from './platform.js';

export const gender = pgEnum('gender', ['male', 'female', 'other']);
export const studentStatus = pgEnum('student_status', ['active', 'left', 'alumni']);
export const guardianRelation = pgEnum('guardian_relation', ['mother', 'father', 'guardian', 'other']);
export const enrollmentStatus = pgEnum('enrollment_status', ['active', 'promoted', 'detained', 'left']);

export const students = pgTable(
  'students',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    // Set when the institute enables a student login (USR-06).
    userId: uuid('user_id').references(() => users.id),
    admissionNo: text('admission_no').notNull(),
    name: text().notNull(),
    dob: date(),
    gender: gender(),
    admissionDate: date('admission_date'),
    status: studentStatus().notNull().default('active'),
    medicalNotes: text('medical_notes'),
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    unique('students_id_institute').on(t.id, t.instituteId),
    uniqueIndex('students_institute_admission_no').on(t.instituteId, t.admissionNo),
    uniqueIndex('students_institute_user').on(t.instituteId, t.userId),
  ],
);

// One row per person per institute; the same parent at two schools has two guardian rows
// sharing one users row.
export const guardians = pgTable(
  'guardians',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    // BR-11: WhatsApp only with recorded opt-in; otherwise SMS/push.
    whatsappOptIn: boolean('whatsapp_opt_in').notNull().default(false),
    language: text().notNull().default('en'),
    ...timestamps,
  },
  (t) => [unique('guardians_id_institute').on(t.id, t.instituteId), uniqueIndex('guardians_institute_user').on(t.instituteId, t.userId)],
);

export const studentGuardians = pgTable(
  'student_guardians',
  {
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull(),
    guardianId: uuid('guardian_id').notNull(),
    relation: guardianRelation().notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.studentId, t.guardianId] }),
    foreignKey({ name: 'student_guardians_student_fk', columns: [t.studentId, t.instituteId], foreignColumns: [students.id, students.instituteId] }).onDelete('cascade'),
    foreignKey({ name: 'student_guardians_guardian_fk', columns: [t.guardianId, t.instituteId], foreignColumns: [guardians.id, guardians.instituteId] }).onDelete('cascade'),
    uniqueIndex('student_guardians_one_primary').on(t.studentId).where(sql`${t.isPrimary}`),
    index('student_guardians_guardian').on(t.guardianId),
  ],
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull(),
    sectionId: uuid('section_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    rollNo: integer('roll_no'),
    status: enrollmentStatus().notNull().default('active'),
    ...timestamps,
  },
  (t) => [
    unique('enrollments_id_institute').on(t.id, t.instituteId),
    foreignKey({ name: 'enrollments_student_fk', columns: [t.studentId, t.instituteId], foreignColumns: [students.id, students.instituteId] }).onDelete('cascade'),
    // Three-column key: the section must belong to the same year and institute.
    foreignKey({
      name: 'enrollments_section_fk',
      columns: [t.sectionId, t.academicYearId, t.instituteId],
      foreignColumns: [sections.id, sections.academicYearId, sections.instituteId],
    }),
    uniqueIndex('enrollments_student_year').on(t.studentId, t.academicYearId),
    uniqueIndex('enrollments_section_roll').on(t.sectionId, t.rollNo),
    index('enrollments_section').on(t.sectionId),
    check('enrollments_roll_positive', sql`${t.rollNo} is null or ${t.rollNo} > 0`),
  ],
);
