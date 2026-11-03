// Exams, marks, grading and report cards (M13, M14, ERD 4).
// Marks are per student per paper; report cards store a computed snapshot (BR-08) so later
// changes to the grade scale do not rewrite published results.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { classes, subjects } from './academics.js';
import { academicYears } from './calendar.js';
import { files } from './homework.js';
import { users } from './identity.js';
import { institutes, timestamps } from './platform.js';
import { students } from './students.js';

const instituteId = () =>
  uuid('institute_id')
    .notNull()
    .references(() => institutes.id, { onDelete: 'cascade' });

export const assessmentTypes = pgTable(
  'assessment_types',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: instituteId(),
    name: text().notNull(),
    /** Share of the term result (BR-09); the institute's types should add up to 100. */
    weightage: numeric({ precision: 5, scale: 2 }).notNull(),
    seq: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [unique('assessment_types_id_institute').on(t.id, t.instituteId), uniqueIndex('assessment_types_institute_name').on(t.instituteId, t.name)],
);

export const gradeScales = pgTable(
  'grade_scales',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: instituteId(),
    name: text().notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    unique('grade_scales_id_institute').on(t.id, t.instituteId),
    uniqueIndex('grade_scales_one_default').on(t.instituteId).where(sql`${t.isDefault}`),
  ],
);

export const gradeBands = pgTable(
  'grade_bands',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: instituteId(),
    gradeScaleId: uuid('grade_scale_id').notNull(),
    minPct: numeric('min_pct', { precision: 5, scale: 2 }).notNull(),
    maxPct: numeric('max_pct', { precision: 5, scale: 2 }).notNull(),
    grade: text().notNull(),
    points: numeric({ precision: 4, scale: 1 }),
    description: text(),
  },
  (t) => [
    foreignKey({ name: 'grade_bands_scale_fk', columns: [t.gradeScaleId, t.instituteId], foreignColumns: [gradeScales.id, gradeScales.instituteId] }).onDelete('cascade'),
    check('grade_bands_range', sql`${t.minPct} >= 0 and ${t.maxPct} <= 100 and ${t.minPct} <= ${t.maxPct}`),
  ],
);

export const examStatus = pgEnum('exam_status', ['draft', 'scheduled', 'locked', 'published']);

export const exams = pgTable(
  'exams',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: instituteId(),
    academicYearId: uuid('academic_year_id').notNull(),
    assessmentTypeId: uuid('assessment_type_id').notNull(),
    name: text().notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    /** draft → scheduled (date sheet out, marks entry open) → locked (all sections moderated) → published. */
    status: examStatus().notNull().default('draft'),
    gradeScaleId: uuid('grade_scale_id'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('exams_id_institute').on(t.id, t.instituteId),
    foreignKey({ name: 'exams_year_fk', columns: [t.academicYearId, t.instituteId], foreignColumns: [academicYears.id, academicYears.instituteId] }),
    foreignKey({ name: 'exams_type_fk', columns: [t.assessmentTypeId, t.instituteId], foreignColumns: [assessmentTypes.id, assessmentTypes.instituteId] }),
    foreignKey({ name: 'exams_scale_fk', columns: [t.gradeScaleId, t.instituteId], foreignColumns: [gradeScales.id, gradeScales.instituteId] }),
    check('exams_dates', sql`${t.endDate} >= ${t.startDate}`),
    index('exams_institute_year').on(t.instituteId, t.academicYearId),
  ],
);

/** One paper per class and subject in an exam. */
export const examPapers = pgTable(
  'exam_papers',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: instituteId(),
    examId: uuid('exam_id').notNull(),
    classId: uuid('class_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    date: date(),
    maxMarks: numeric('max_marks', { precision: 6, scale: 2 }).notNull(),
    passMarks: numeric('pass_marks', { precision: 6, scale: 2 }).notNull(),
    syllabusScope: text('syllabus_scope'),
    ...timestamps,
  },
  (t) => [
    unique('exam_papers_id_institute').on(t.id, t.instituteId),
    foreignKey({ name: 'exam_papers_exam_fk', columns: [t.examId, t.instituteId], foreignColumns: [exams.id, exams.instituteId] }).onDelete('cascade'),
    foreignKey({ name: 'exam_papers_class_fk', columns: [t.classId, t.instituteId], foreignColumns: [classes.id, classes.instituteId] }),
    foreignKey({ name: 'exam_papers_subject_fk', columns: [t.subjectId, t.instituteId], foreignColumns: [subjects.id, subjects.instituteId] }),
    uniqueIndex('exam_papers_exam_class_subject').on(t.examId, t.classId, t.subjectId),
    check('exam_papers_marks', sql`${t.maxMarks} > 0 and ${t.passMarks} >= 0 and ${t.passMarks} <= ${t.maxMarks}`),
  ],
);

export const marks = pgTable(
  'marks',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: instituteId(),
    examPaperId: uuid('exam_paper_id').notNull(),
    studentId: uuid('student_id').notNull(),
    marksObtained: numeric('marks_obtained', { precision: 6, scale: 2 }),
    isAbsent: boolean('is_absent').notNull().default(false),
    enteredBy: uuid('entered_by')
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [
    foreignKey({ name: 'marks_paper_fk', columns: [t.examPaperId, t.instituteId], foreignColumns: [examPapers.id, examPapers.instituteId] }).onDelete('cascade'),
    foreignKey({ name: 'marks_student_fk', columns: [t.studentId, t.instituteId], foreignColumns: [students.id, students.instituteId] }).onDelete('cascade'),
    uniqueIndex('marks_paper_student').on(t.examPaperId, t.studentId),
    index('marks_student').on(t.studentId),
    check('marks_value', sql`${t.marksObtained} is null or ${t.marksObtained} >= 0`),
    // An absent student has no marks; a present one may still be blank until entered (BR-06).
    check('marks_absent_blank', sql`not ${t.isAbsent} or ${t.marksObtained} is null`),
  ],
);

/** MK-03: once a class teacher locks a section for an exam, marks changes need principal approval. */
export const examSectionLocks = pgTable(
  'exam_section_locks',
  {
    instituteId: instituteId(),
    examId: uuid('exam_id').notNull(),
    sectionId: uuid('section_id').notNull(),
    lockedBy: uuid('locked_by')
      .notNull()
      .references(() => users.id),
    lockedAt: timestamp('locked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('exam_section_locks_pk').on(t.examId, t.sectionId),
    foreignKey({ name: 'exam_section_locks_exam_fk', columns: [t.examId, t.instituteId], foreignColumns: [exams.id, exams.instituteId] }).onDelete('cascade'),
  ],
);

export interface ReportCardSubject {
  subjectId: string;
  subject: string;
  maxMarks: number;
  marks: number | null;
  absent: boolean;
  percent: number | null;
  grade: string | null;
  points: number | null;
  passed: boolean | null;
  classAverage: number | null;
}

export interface ReportCardData {
  subjects: ReportCardSubject[];
  totalMarks: number;
  totalMax: number;
  percent: number | null;
  grade: string | null;
  points: number | null;
  passed: boolean;
  rank: number | null;
  sectionSize: number;
  attendancePercent: number | null;
  sectionName: string;
  className: string;
  rollNo: number | null;
}

export const reportCardStatus = pgEnum('report_card_status', ['draft', 'published']);

export const reportCards = pgTable(
  'report_cards',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: instituteId(),
    examId: uuid('exam_id').notNull(),
    studentId: uuid('student_id').notNull(),
    data: jsonb().$type<ReportCardData>().notNull(),
    remarks: text(),
    remarksAiDrafted: boolean('remarks_ai_drafted').notNull().default(false),
    status: reportCardStatus().notNull().default('draft'),
    pdfFileId: uuid('pdf_file_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('report_cards_id_institute').on(t.id, t.instituteId),
    foreignKey({ name: 'report_cards_exam_fk', columns: [t.examId, t.instituteId], foreignColumns: [exams.id, exams.instituteId] }).onDelete('cascade'),
    foreignKey({ name: 'report_cards_student_fk', columns: [t.studentId, t.instituteId], foreignColumns: [students.id, students.instituteId] }).onDelete('cascade'),
    foreignKey({ name: 'report_cards_pdf_fk', columns: [t.pdfFileId, t.instituteId], foreignColumns: [files.id, files.instituteId] }),
    uniqueIndex('report_cards_exam_student').on(t.examId, t.studentId),
    index('report_cards_student').on(t.studentId),
  ],
);
