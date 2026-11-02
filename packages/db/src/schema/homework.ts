// Files (ERD 3) and homework (M11): a task for a section and subject, its attachments, and each
// student's completion as recorded by the teacher (HW-05).
import { boolean, date, foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sections, staff, subjects } from './academics.js';
import { users } from './identity.js';
import { institutes, timestamps } from './platform.js';
import { students } from './students.js';

export const files = pgTable(
  'files',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull().unique(),
    originalName: text('original_name').notNull(),
    mime: text().notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('files_id_institute').on(t.id, t.instituteId)],
);

export const homeworkStatus = pgEnum('homework_status', ['published', 'cancelled']);
export const completionStatus = pgEnum('completion_status', ['done', 'pending', 'late']);

export interface HomeworkLink {
  url: string;
  label?: string;
}

export const homework = pgTable(
  'homework',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    staffId: uuid('staff_id').notNull(),
    title: text().notNull(),
    instructions: text(),
    dueDate: date('due_date').notNull(),
    links: jsonb().$type<HomeworkLink[]>().notNull().default([]),
    // BR-12: urgent homework skips the daily digest.
    isUrgent: boolean('is_urgent').notNull().default(false),
    status: homeworkStatus().notNull().default('published'),
    ...timestamps,
  },
  (t) => [
    unique('homework_id_institute').on(t.id, t.instituteId),
    foreignKey({ name: 'homework_section_fk', columns: [t.sectionId, t.instituteId], foreignColumns: [sections.id, sections.instituteId] }).onDelete('cascade'),
    foreignKey({ name: 'homework_subject_fk', columns: [t.subjectId, t.instituteId], foreignColumns: [subjects.id, subjects.instituteId] }),
    foreignKey({ name: 'homework_staff_fk', columns: [t.staffId, t.instituteId], foreignColumns: [staff.id, staff.instituteId] }),
    index('homework_section_due').on(t.sectionId, t.dueDate),
  ],
);

export const homeworkAttachments = pgTable(
  'homework_attachments',
  {
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    homeworkId: uuid('homework_id').notNull(),
    fileId: uuid('file_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.homeworkId, t.fileId] }),
    foreignKey({ name: 'homework_attachments_homework_fk', columns: [t.homeworkId, t.instituteId], foreignColumns: [homework.id, homework.instituteId] }).onDelete('cascade'),
    foreignKey({ name: 'homework_attachments_file_fk', columns: [t.fileId, t.instituteId], foreignColumns: [files.id, files.instituteId] }),
  ],
);

export const homeworkSubmissions = pgTable(
  'homework_submissions',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    homeworkId: uuid('homework_id').notNull(),
    studentId: uuid('student_id').notNull(),
    status: completionStatus().notNull(),
    feedback: text(),
    score: numeric({ precision: 6, scale: 2 }),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    ...timestamps,
  },
  (t) => [
    foreignKey({ name: 'homework_submissions_homework_fk', columns: [t.homeworkId, t.instituteId], foreignColumns: [homework.id, homework.instituteId] }).onDelete('cascade'),
    foreignKey({ name: 'homework_submissions_student_fk', columns: [t.studentId, t.instituteId], foreignColumns: [students.id, students.instituteId] }).onDelete('cascade'),
    uniqueIndex('homework_submissions_homework_student').on(t.homeworkId, t.studentId),
  ],
);
