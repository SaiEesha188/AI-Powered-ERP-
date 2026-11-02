// Student attendance (M08, ERD 3): one session per section per day (or period), one record
// per student. Records are written for the whole roster so reports never infer "present".
import { date, foreignKey, index, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sections } from './academics.js';
import { users } from './identity.js';
import { institutes, timestamps } from './platform.js';
import { students } from './students.js';

export const attendanceStatus = pgEnum('attendance_status', ['present', 'absent', 'late', 'half_day', 'leave']);

export const attendanceSessions = pgTable(
  'attendance_sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id').notNull(),
    date: date().notNull(),
    // 0 = daily attendance; 1..n = period-wise, once the timetable exists (ATT-01).
    periodNo: integer('period_no').notNull().default(0),
    markedBy: uuid('marked_by')
      .notNull()
      .references(() => users.id),
    /** When attendance was first taken (client time for offline captures). */
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull(),
    updatedBy: uuid('updated_by').references(() => users.id),
    ...timestamps,
  },
  (t) => [
    unique('attendance_sessions_id_institute').on(t.id, t.instituteId),
    foreignKey({ name: 'attendance_sessions_section_fk', columns: [t.sectionId, t.instituteId], foreignColumns: [sections.id, sections.instituteId] }).onDelete('cascade'),
    uniqueIndex('attendance_sessions_section_date_period').on(t.sectionId, t.date, t.periodNo),
    index('attendance_sessions_institute_date').on(t.instituteId, t.date),
  ],
);

export const studentAttendance = pgTable(
  'student_attendance',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').notNull(),
    studentId: uuid('student_id').notNull(),
    status: attendanceStatus().notNull(),
    remark: text(),
    ...timestamps,
  },
  (t) => [
    foreignKey({ name: 'student_attendance_session_fk', columns: [t.sessionId, t.instituteId], foreignColumns: [attendanceSessions.id, attendanceSessions.instituteId] }).onDelete('cascade'),
    foreignKey({ name: 'student_attendance_student_fk', columns: [t.studentId, t.instituteId], foreignColumns: [students.id, students.instituteId] }).onDelete('cascade'),
    uniqueIndex('student_attendance_session_student').on(t.sessionId, t.studentId),
    index('student_attendance_student').on(t.studentId),
  ],
);
