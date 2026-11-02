// Academic years, terms, holidays and events (CAL-01, CAL-03..06).
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { classes } from './academics.js';
import { users } from './identity.js';
import { institutes, timestamps } from './platform.js';

export const academicYears = pgTable(
  'academic_years',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    check('academic_years_dates', sql`${t.endDate} > ${t.startDate}`),
    uniqueIndex('academic_years_institute_name').on(t.instituteId, t.name),
    unique('academic_years_id_institute').on(t.id, t.instituteId),
    // At most one current year per institute.
    uniqueIndex('academic_years_one_current').on(t.instituteId).where(sql`${t.isCurrent}`),
  ],
);

export const calendarEventType = pgEnum('calendar_event_type', ['holiday', 'half_day', 'event', 'exam', 'ptm']);
export const calendarEventScope = pgEnum('calendar_event_scope', ['all', 'classes', 'staff']);
export const calendarEventStatus = pgEnum('calendar_event_status', ['pending', 'approved', 'rejected']);

/** Holidays and events (CAL-03..06). Only approved rows affect attendance and are announced. */
export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    type: calendarEventType().notNull(),
    title: text().notNull(),
    description: text(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    scope: calendarEventScope().notNull().default('all'),
    status: calendarEventStatus().notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('calendar_events_id_institute').on(t.id, t.instituteId),
    check('calendar_events_dates', sql`${t.endDate} >= ${t.startDate}`),
    index('calendar_events_institute_dates').on(t.instituteId, t.startDate, t.endDate),
  ],
);

/** Classes an event applies to when scope = 'classes'. */
export const calendarEventClasses = pgTable(
  'calendar_event_classes',
  {
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').notNull(),
    classId: uuid('class_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.classId] }),
    foreignKey({ name: 'calendar_event_classes_event_fk', columns: [t.eventId, t.instituteId], foreignColumns: [calendarEvents.id, calendarEvents.instituteId] }).onDelete('cascade'),
    foreignKey({ name: 'calendar_event_classes_class_fk', columns: [t.classId, t.instituteId], foreignColumns: [classes.id, classes.instituteId] }).onDelete('cascade'),
  ],
);

export const terms = pgTable(
  'terms',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id').notNull(),
    name: text().notNull(),
    seq: integer().notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    ...timestamps,
  },
  (t) => [
    // Composite key keeps a term inside its year's institute (FK checks bypass RLS).
    foreignKey({
      name: 'terms_year_fk',
      columns: [t.academicYearId, t.instituteId],
      foreignColumns: [academicYears.id, academicYears.instituteId],
    }).onDelete('cascade'),
    check('terms_dates', sql`${t.endDate} > ${t.startDate}`),
    uniqueIndex('terms_year_seq').on(t.academicYearId, t.seq),
    index('terms_institute').on(t.instituteId),
  ],
);
