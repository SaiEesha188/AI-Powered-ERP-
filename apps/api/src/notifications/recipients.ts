// Who receives each notification event, and with which variables. Every function runs inside
// the event's institute (withTenant on the erp_app connection), so RLS bounds what it can see.
import {
  academicYears,
  and,
  announcementRecipients,
  announcements,
  attendanceSessions,
  calendarEventClasses,
  calendarEvents,
  enrollments,
  eq,
  examPapers,
  exams,
  reportCards,
  guardians,
  homework,
  inArray,
  materials,
  materialSections,
  isNotNull,
  sections,
  staff,
  studentAttendance,
  studentGuardians,
  students,
  subjects,
  type Tx,
  users,
} from '@erp/db';
import type { NotificationEventType } from '@erp/shared';
import { shortDate } from '../common/institute.js';
import type { loadInstitute } from '../common/institute.js';

export type Institute = Awaited<ReturnType<typeof loadInstitute>>;

export interface Recipient {
  userId: string;
  phone: string;
  language: string;
  channel: 'whatsapp' | 'sms';
  variables: Record<string, string>;
  /** Deliveries with the same base key (per recipient, per day) are sent as one digest. */
  digestKey?: string;
}

export interface Expansion {
  sourceType?: string;
  sourceId?: string;
  recipients: Recipient[];
  /** e.g. urgent homework skips the digest (BR-12). */
  forceImmediate?: boolean;
}

export type Handler = (tx: Tx, payload: Record<string, unknown>, institute: Institute) => Promise<Expansion>;

interface GuardianRow {
  userId: string;
  phone: string | null;
  language: string;
  whatsappOptIn: boolean;
  studentId: string;
  studentName: string;
}

/** BR-11: WhatsApp only with recorded opt-in; everyone else gets SMS. */
function guardianChannel(g: { whatsappOptIn: boolean }, institute: Institute): 'whatsapp' | 'sms' {
  return institute.settings.familyChannel === 'whatsapp' && g.whatsappOptIn ? 'whatsapp' : 'sms';
}

export function familyRecipients(rows: GuardianRow[], institute: Institute, variables: (g: GuardianRow) => Record<string, string>, digestBase?: (g: GuardianRow) => string): Recipient[] {
  if (institute.settings.familyChannel === 'none') return [];
  return rows
    .filter((g): g is GuardianRow & { phone: string } => Boolean(g.phone))
    .map((g) => ({
      userId: g.userId,
      phone: g.phone,
      language: g.language,
      channel: guardianChannel(g, institute),
      variables: variables(g),
      digestKey: digestBase?.(g),
    }));
}

/** One entry per (guardian, child). */
export async function guardiansOfStudents(tx: Tx, studentIds: string[]): Promise<GuardianRow[]> {
  if (!studentIds.length) return [];
  return tx
    .select({
      userId: users.id,
      phone: users.phone,
      language: guardians.language,
      whatsappOptIn: guardians.whatsappOptIn,
      studentId: students.id,
      studentName: students.name,
    })
    .from(studentGuardians)
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .innerJoin(users, eq(users.id, guardians.userId))
    .innerJoin(students, eq(students.id, studentGuardians.studentId))
    .where(and(inArray(studentGuardians.studentId, studentIds), eq(students.status, 'active')));
}

/** Active students enrolled this year in the given sections or classes (all when both are omitted). */
export async function enrolledStudentIds(tx: Tx, filter: { sectionIds?: string[]; classIds?: string[] } = {}): Promise<string[]> {
  const rows = await tx
    .select({ id: enrollments.studentId })
    .from(enrollments)
    .innerJoin(academicYears, and(eq(academicYears.id, enrollments.academicYearId), eq(academicYears.isCurrent, true)))
    .innerJoin(sections, eq(sections.id, enrollments.sectionId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(
      and(
        eq(enrollments.status, 'active'),
        eq(students.status, 'active'),
        filter.sectionIds ? inArray(enrollments.sectionId, filter.sectionIds) : undefined,
        filter.classIds ? inArray(sections.classId, filter.classIds) : undefined,
      ),
    );
  return [...new Set(rows.map((r) => r.id))];
}

async function staffRecipients(tx: Tx, variables: Record<string, string>): Promise<Recipient[]> {
  const rows = await tx
    .select({ userId: users.id, phone: users.phone })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .where(and(eq(staff.status, 'active'), isNotNull(users.phone)));
  return rows.map((r) => ({ userId: r.userId, phone: r.phone!, language: 'en', channel: 'whatsapp' as const, variables }));
}

/** One message per person even when they have several children (calendar, circulars). */
export function onePerPerson(list: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  return list.filter((r) => (seen.has(r.userId) ? false : (seen.add(r.userId), true)));
}

const absent: Handler = async (tx, payload, institute) => {
  const { sectionId, date, studentIds } = payload as { sectionId: string; date: string; studentIds: string[] };
  // Re-check at send time: a teacher who fixes a mistaken absence within seconds sends no alert.
  const stillAbsent = await tx
    .select({ id: studentAttendance.studentId })
    .from(studentAttendance)
    .innerJoin(attendanceSessions, eq(attendanceSessions.id, studentAttendance.sessionId))
    .where(
      and(
        eq(attendanceSessions.sectionId, sectionId),
        eq(attendanceSessions.date, date),
        eq(attendanceSessions.periodNo, 0),
        eq(studentAttendance.status, 'absent'),
        inArray(studentAttendance.studentId, studentIds),
      ),
    );
  const rows = await guardiansOfStudents(tx, stillAbsent.map((r) => r.id));
  return {
    sourceType: 'attendance',
    recipients: familyRecipients(rows, institute, (g) => ({ studentName: g.studentName, date: shortDate(date), instituteName: institute.name })),
  };
};

const calendarPublished: Handler = async (tx, payload, institute) => {
  const [event] = await tx
    .select({ id: calendarEvents.id, title: calendarEvents.title, startDate: calendarEvents.startDate, endDate: calendarEvents.endDate, scope: calendarEvents.scope, status: calendarEvents.status })
    .from(calendarEvents)
    .where(eq(calendarEvents.id, payload.eventId as string));
  if (!event || event.status !== 'approved') return { recipients: [] };
  const variables = {
    instituteName: institute.name,
    title: event.title,
    dates: event.startDate === event.endDate ? shortDate(event.startDate) : `${shortDate(event.startDate)} to ${shortDate(event.endDate)}`,
  };
  let family: Recipient[] = [];
  if (event.scope !== 'staff') {
    const classIds =
      event.scope === 'classes'
        ? (await tx.select({ id: calendarEventClasses.classId }).from(calendarEventClasses).where(eq(calendarEventClasses.eventId, event.id))).map((r) => r.id)
        : undefined;
    family = familyRecipients(await guardiansOfStudents(tx, await enrolledStudentIds(tx, { classIds })), institute, () => variables);
  }
  return { sourceType: 'calendar_event', sourceId: event.id, recipients: onePerPerson([...(await staffRecipients(tx, variables)), ...family]) };
};

const homeworkPosted: Handler = async (tx, payload, institute) => {
  const [hw] = await tx
    .select({ id: homework.id, sectionId: homework.sectionId, title: homework.title, dueDate: homework.dueDate, isUrgent: homework.isUrgent, status: homework.status, subject: subjects.name })
    .from(homework)
    .innerJoin(subjects, eq(subjects.id, homework.subjectId))
    .where(eq(homework.id, payload.homeworkId as string));
  // Cancelled before the digest went out: nothing to tell families.
  if (!hw || hw.status !== 'published') return { recipients: [] };
  const rows = await guardiansOfStudents(tx, await enrolledStudentIds(tx, { sectionIds: [hw.sectionId] }));
  return {
    sourceType: 'homework',
    sourceId: hw.id,
    forceImmediate: hw.isUrgent,
    recipients: familyRecipients(
      rows,
      institute,
      (g) => ({ studentName: g.studentName, item: `${hw.subject}: ${hw.title} (due ${shortDate(hw.dueDate)})` }),
      (g) => `homework:${g.studentId}`,
    ),
  };
};

const materialAdded: Handler = async (tx, payload, institute) => {
  const [m] = await tx
    .select({ id: materials.id, classId: materials.classId, title: materials.title, audience: materials.audience, subject: subjects.name })
    .from(materials)
    .innerJoin(subjects, eq(subjects.id, materials.subjectId))
    .where(eq(materials.id, payload.materialId as string));
  // Parents are told only about material they can open; students have no logins yet.
  if (!m || m.audience !== 'everyone') return { recipients: [] };
  const limited = (await tx.select({ id: materialSections.sectionId }).from(materialSections).where(eq(materialSections.materialId, m.id))).map((r) => r.id);
  const studentIds = await enrolledStudentIds(tx, limited.length ? { sectionIds: limited } : { classIds: [m.classId] });
  return {
    sourceType: 'material',
    sourceId: m.id,
    recipients: familyRecipients(
      await guardiansOfStudents(tx, studentIds),
      institute,
      (g) => ({ studentName: g.studentName, item: `${m.subject}: ${m.title}` }),
      (g) => `material:${g.studentId}`,
    ),
  };
};

const circularPublished: Handler = async (tx, payload, institute) => {
  const [circular] = await tx
    .select({ id: announcements.id, title: announcements.title, status: announcements.status })
    .from(announcements)
    .where(eq(announcements.id, payload.announcementId as string));
  if (!circular || circular.status !== 'published') return { recipients: [] };
  const rows = await tx
    .select({ userId: users.id, phone: users.phone, kind: announcementRecipients.kind, language: guardians.language, whatsappOptIn: guardians.whatsappOptIn })
    .from(announcementRecipients)
    .innerJoin(users, eq(users.id, announcementRecipients.userId))
    .leftJoin(guardians, eq(guardians.userId, users.id))
    .where(and(eq(announcementRecipients.announcementId, circular.id), isNotNull(users.phone)));
  const variables = { instituteName: institute.name, title: circular.title, link: payload.link as string };
  const recipients: Recipient[] = [];
  for (const r of rows) {
    if (r.kind === 'staff') recipients.push({ userId: r.userId, phone: r.phone!, language: 'en', channel: 'whatsapp', variables });
    else recipients.push(...familyRecipients([{ ...r, language: r.language ?? 'en', whatsappOptIn: r.whatsappOptIn ?? false, studentId: '', studentName: '' }], institute, () => variables));
  }
  return { sourceType: 'circular', sourceId: circular.id, recipients };
};

const examScheduled: Handler = async (tx, payload, institute) => {
  const [exam] = await tx.select({ id: exams.id, name: exams.name, startDate: exams.startDate, endDate: exams.endDate, status: exams.status }).from(exams).where(eq(exams.id, payload.examId as string));
  if (!exam || exam.status === 'draft') return { recipients: [] };
  const classIds = [...new Set((await tx.select({ classId: examPapers.classId }).from(examPapers).where(eq(examPapers.examId, exam.id))).map((r) => r.classId))];
  const dates = exam.startDate === exam.endDate ? shortDate(exam.startDate) : `${shortDate(exam.startDate)} to ${shortDate(exam.endDate)}`;
  const rows = await guardiansOfStudents(tx, await enrolledStudentIds(tx, { classIds }));
  return { sourceType: 'exam', sourceId: exam.id, recipients: familyRecipients(rows, institute, (g) => ({ studentName: g.studentName, examName: exam.name, dates, link: payload.link as string })) };
};

const reportCardPublished: Handler = async (tx, payload, institute) => {
  const [exam] = await tx.select({ id: exams.id, name: exams.name, status: exams.status }).from(exams).where(eq(exams.id, payload.examId as string));
  if (!exam || exam.status !== 'published') return { recipients: [] };
  const cards = await tx.select({ id: reportCards.id, studentId: reportCards.studentId }).from(reportCards).where(and(eq(reportCards.examId, exam.id), eq(reportCards.status, 'published')));
  const rows = await guardiansOfStudents(tx, cards.map((c) => c.studentId));
  return {
    sourceType: 'exam',
    sourceId: exam.id,
    recipients: familyRecipients(rows, institute, (g) => ({ studentName: g.studentName, examName: exam.name, link: `${payload.link as string}/${cards.find((c) => c.studentId === g.studentId)?.id ?? ''}` })),
  };
};

/** Steps that add events register their handler here. */
export const HANDLERS: Partial<Record<NotificationEventType, Handler>> = {
  'attendance.absent': absent,
  'calendar.published': calendarPublished,
  'homework.posted': homeworkPosted,
  'material.added': materialAdded,
  'circular.published': circularPublished,
  'exam.scheduled': examScheduled,
  'report_card.published': reportCardPublished,
};
