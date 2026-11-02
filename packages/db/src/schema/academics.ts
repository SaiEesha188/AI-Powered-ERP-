// Staff profiles (M06) and the academic structure (M07, ERD 2): classes, sections per academic
// year, subjects, the subjects each class takes, and who teaches what.
// References between tenant tables use (id, institute_id) so a row can never point into another
// institute: foreign-key checks bypass RLS.
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { academicYears } from './calendar.js';
import { users } from './identity.js';
import { institutes, timestamps } from './platform.js';

const instituteId = () =>
  uuid('institute_id')
    .notNull()
    .references(() => institutes.id, { onDelete: 'cascade' });

export const staffStatus = pgEnum('staff_status', ['active', 'left']);
export const subjectType = pgEnum('subject_type', ['scholastic', 'co_scholastic', 'elective']);

export const staff = pgTable(
  'staff',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: instituteId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    employeeCode: text('employee_code'),
    designation: text().notNull(),
    joiningDate: date('joining_date'),
    status: staffStatus().notNull().default('active'),
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    unique('staff_id_institute').on(t.id, t.instituteId),
    uniqueIndex('staff_institute_user').on(t.instituteId, t.userId),
    uniqueIndex('staff_institute_code').on(t.instituteId, t.employeeCode),
  ],
);

export const classes = pgTable(
  'classes',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: instituteId(),
    name: text().notNull(),
    // Orders classes (Nursery = 0, Class 1 = 1 ...) and drives year-end promotion.
    level: integer().notNull(),
    ...timestamps,
  },
  (t) => [unique('classes_id_institute').on(t.id, t.instituteId), uniqueIndex('classes_institute_name').on(t.instituteId, t.name)],
);

export const subjects = pgTable(
  'subjects',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: instituteId(),
    name: text().notNull(),
    code: text().notNull(),
    type: subjectType().notNull().default('scholastic'),
    ...timestamps,
  },
  (t) => [unique('subjects_id_institute').on(t.id, t.instituteId), uniqueIndex('subjects_institute_code').on(t.instituteId, t.code)],
);

export const classSubjects = pgTable(
  'class_subjects',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: instituteId(),
    classId: uuid('class_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    periodsPerWeek: integer('periods_per_week'),
    ...timestamps,
  },
  (t) => [
    foreignKey({ name: 'class_subjects_class_fk', columns: [t.classId, t.instituteId], foreignColumns: [classes.id, classes.instituteId] }).onDelete('cascade'),
    foreignKey({ name: 'class_subjects_subject_fk', columns: [t.subjectId, t.instituteId], foreignColumns: [subjects.id, subjects.instituteId] }).onDelete('cascade'),
    uniqueIndex('class_subjects_class_subject').on(t.classId, t.subjectId),
    check('class_subjects_periods', sql`${t.periodsPerWeek} is null or ${t.periodsPerWeek} between 0 and 60`),
  ],
);

export const sections = pgTable(
  'sections',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: instituteId(),
    classId: uuid('class_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    name: text().notNull(),
    classTeacherId: uuid('class_teacher_id'),
    ...timestamps,
  },
  (t) => [
    unique('sections_id_institute').on(t.id, t.instituteId),
    // Lets enrollments prove their section belongs to the same academic year.
    unique('sections_id_year_institute').on(t.id, t.academicYearId, t.instituteId),
    foreignKey({ name: 'sections_class_fk', columns: [t.classId, t.instituteId], foreignColumns: [classes.id, classes.instituteId] }),
    foreignKey({
      name: 'sections_year_fk',
      columns: [t.academicYearId, t.instituteId],
      foreignColumns: [academicYears.id, academicYears.instituteId],
    }),
    foreignKey({ name: 'sections_class_teacher_fk', columns: [t.classTeacherId, t.instituteId], foreignColumns: [staff.id, staff.instituteId] }),
    uniqueIndex('sections_class_year_name').on(t.classId, t.academicYearId, t.name),
    index('sections_institute_year').on(t.instituteId, t.academicYearId),
  ],
);

export const teacherAssignments = pgTable(
  'teacher_assignments',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: instituteId(),
    staffId: uuid('staff_id').notNull(),
    sectionId: uuid('section_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    ...timestamps,
  },
  (t) => [
    foreignKey({ name: 'teacher_assignments_staff_fk', columns: [t.staffId, t.instituteId], foreignColumns: [staff.id, staff.instituteId] }),
    foreignKey({ name: 'teacher_assignments_section_fk', columns: [t.sectionId, t.instituteId], foreignColumns: [sections.id, sections.instituteId] }).onDelete('cascade'),
    foreignKey({ name: 'teacher_assignments_subject_fk', columns: [t.subjectId, t.instituteId], foreignColumns: [subjects.id, subjects.instituteId] }),
    uniqueIndex('teacher_assignments_unique').on(t.staffId, t.sectionId, t.subjectId),
    index('teacher_assignments_section').on(t.sectionId),
  ],
);
