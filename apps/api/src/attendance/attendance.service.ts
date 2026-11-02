import {
  academicYears,
  and,
  asc,
  attendanceSessions,
  classes,
  enrollments,
  eq,
  gte,
  inArray,
  lte,
  sections,
  sql,
  studentAttendance,
  students,
  type Tx,
} from '@erp/db';
import { AppError, type DefaultersQuery, type MarkAttendanceInput } from '@erp/shared';
import { Injectable } from '@nestjs/common';
import { TeachingScope } from '../academics/teaching-scope.js';
import { CalendarEventsService } from '../calendar/calendar-events.service.js';
import { addDays, loadInstitute, localDate } from '../common/institute.js';
import { currentContext, currentTenant } from '../common/request-context.js';
import { AuditService, TenantDb } from '../core/core.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';

type Status = 'present' | 'absent' | 'late' | 'half_day' | 'leave';
const CODES: Record<Status, string> = { present: 'P', absent: 'A', late: 'L', half_day: 'H', leave: 'LV' };
const OFFLINE_SYNC_LIMIT_MS = 48 * 60 * 60 * 1000;

/** Present-equivalent share: late counts as present, a half day as half. Leave is not present. */
export function attendancePercent(counts: { total: number; present: number; late: number; halfDay: number }) {
  if (counts.total === 0) return null;
  return Math.round(((counts.present + counts.late + counts.halfDay / 2) / counts.total) * 1000) / 10;
}

function localTime(timezone: string, at: Date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
}

export interface MarkResult {
  sessionId: string;
  /** Students who became absent with this save; the notification engine alerts their families. */
  newlyAbsent: string[];
}

/** Student attendance (M08): marking, corrections and reports. */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly scope: TeachingScope,
    private readonly calendar: CalendarEventsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The class register for a day, defaulting unmarked students to present (ATT-02). */
  roster(sectionId: string, date: string) {
    return this.tenantDb.run((tx) => this.rosterIn(tx, sectionId, date));
  }

  mark(sectionId: string, input: MarkAttendanceInput) {
    return this.tenantDb.run(async (tx) => {
      const result = await this.markIn(tx, sectionId, input);
      return { ...(await this.rosterIn(tx, sectionId, input.date)), newlyAbsent: result.newlyAbsent };
    });
  }

  async markIn(tx: Tx, sectionId: string, input: MarkAttendanceInput): Promise<MarkResult> {
    const { userId, instituteId } = currentTenant();
    const institute = await loadInstitute(tx);
    const section = await this.findSection(tx, sectionId);
    const editAny = currentContext().permissions.has('attendance.edit_any');
    if (!editAny && !(await this.scope.teachesSection(tx, sectionId))) {
      throw new AppError('forbidden', 'You can mark attendance only for sections you teach');
    }

    const today = localDate(institute.timezone);
    if (input.date > today) throw new AppError('invalid', 'Attendance cannot be marked for a future date');
    if (input.date < section.yearStart || input.date > section.yearEnd) throw new AppError('invalid', 'Date is outside the section’s academic year');
    const day = await this.calendar.dayStatus(tx, input.date, section.classId);
    if (!day.working) throw new AppError('conflict', `No classes on ${input.date}: ${day.reason}`);

    // BR-02: teachers may edit until the end of the day the attendance was taken. A capture made
    // offline keeps its original time, so syncing it the next morning still counts as same-day.
    const now = Date.now();
    const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date(now);
    if (capturedAt.getTime() > now + 5 * 60_000) throw new AppError('invalid', 'capturedAt is in the future');
    if (capturedAt.getTime() < now - OFFLINE_SYNC_LIMIT_MS) throw new AppError('invalid', 'Offline capture is too old to sync; ask the office to enter it');
    const withinWindow = localDate(institute.timezone, capturedAt) === input.date;
    if (!withinWindow) {
      if (!editAny) throw new AppError('forbidden', 'The edit window has closed; ask the office to correct this day');
      if (!input.reason) throw new AppError('invalid', 'A reason is required to correct past attendance');
    }

    const roster = await this.enrolled(tx, sectionId);
    const rosterIds = new Set(roster.map((s) => s.studentId));
    const stray = input.records.find((r) => !rosterIds.has(r.studentId));
    if (stray) throw new AppError('invalid', 'A student in the list is not enrolled in this section');

    const [existing] = await tx
      .select({ id: attendanceSessions.id })
      .from(attendanceSessions)
      .where(and(eq(attendanceSessions.sectionId, sectionId), eq(attendanceSessions.date, input.date), eq(attendanceSessions.periodNo, 0)))
      .for('update');
    const sessionId = existing
      ? (await tx.update(attendanceSessions).set({ updatedBy: userId }).where(eq(attendanceSessions.id, existing.id)).returning({ id: attendanceSessions.id }))[0]!.id
      : (await tx.insert(attendanceSessions).values({ instituteId, sectionId, date: input.date, markedBy: userId, markedAt: capturedAt }).returning({ id: attendanceSessions.id }))[0]!.id;

    const previous = new Map(
      (await tx.select({ studentId: studentAttendance.studentId, status: studentAttendance.status }).from(studentAttendance).where(eq(studentAttendance.sessionId, sessionId))).map(
        (r) => [r.studentId, r.status],
      ),
    );
    const given = new Map(input.records.map((r) => [r.studentId, r]));
    const rows = roster.map((s) => ({
      instituteId,
      sessionId,
      studentId: s.studentId,
      status: (given.get(s.studentId)?.status ?? 'present') as Status,
      remark: given.get(s.studentId)?.remark ?? null,
    }));
    if (rows.length) {
      await tx
        .insert(studentAttendance)
        .values(rows)
        .onConflictDoUpdate({
          target: [studentAttendance.sessionId, studentAttendance.studentId],
          set: { status: sql`excluded.status`, remark: sql`excluded.remark`, updatedAt: new Date() },
        });
    }

    const changed = rows.filter((r) => previous.get(r.studentId) !== r.status);
    await this.audit.record(tx, {
      action: existing ? 'attendance.update' : 'attendance.mark',
      entity: 'attendance_session',
      entityId: sessionId,
      before: existing ? Object.fromEntries(changed.map((r) => [r.studentId, previous.get(r.studentId) ?? null])) : null,
      after: {
        sectionId,
        date: input.date,
        changes: Object.fromEntries(changed.map((r) => [r.studentId, r.status])),
        reason: input.reason ?? null,
        offline: Boolean(input.capturedAt),
      },
    });
    const newlyAbsent = rows.filter((r) => r.status === 'absent' && previous.get(r.studentId) !== 'absent').map((r) => r.studentId);
    // ATT-04: alert families the same day only; a correction to last week is not news to them.
    if (newlyAbsent.length && input.date === today) {
      await this.notifications.emit(tx, 'attendance.absent', { sectionId, date: input.date, studentIds: newlyAbsent });
    }
    return { sessionId, newlyAbsent };
  }

  /** ATT-07/08: every section's status for a day, and whether it was marked before the cutoff. */
  dailySummary(date: string) {
    return this.tenantDb.run(async (tx) => {
      const institute = await loadInstitute(tx);
      const rows = await tx
        .select({ sectionId: sections.id, sectionName: sections.name, classId: classes.id, className: classes.name })
        .from(sections)
        .innerJoin(classes, eq(classes.id, sections.classId))
        .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
        .where(eq(academicYears.isCurrent, true))
        .orderBy(asc(classes.level), asc(sections.name));
      const enrolled = await this.enrolledCounts(tx, rows.map((r) => r.sectionId));
      const sessions = await tx
        .select({
          sectionId: attendanceSessions.sectionId,
          markedAt: attendanceSessions.markedAt,
          present: sql<number>`count(*) filter (where ${studentAttendance.status} = 'present')`.mapWith(Number),
          absent: sql<number>`count(*) filter (where ${studentAttendance.status} = 'absent')`.mapWith(Number),
          late: sql<number>`count(*) filter (where ${studentAttendance.status} = 'late')`.mapWith(Number),
          halfDay: sql<number>`count(*) filter (where ${studentAttendance.status} = 'half_day')`.mapWith(Number),
          leave: sql<number>`count(*) filter (where ${studentAttendance.status} = 'leave')`.mapWith(Number),
        })
        .from(attendanceSessions)
        .leftJoin(studentAttendance, eq(studentAttendance.sessionId, attendanceSessions.id))
        .where(and(eq(attendanceSessions.date, date), eq(attendanceSessions.periodNo, 0)))
        .groupBy(attendanceSessions.sectionId, attendanceSessions.markedAt);

      const closed = new Map<string, string | undefined>();
      for (const classId of new Set(rows.map((r) => r.classId))) {
        const status = await this.calendar.dayStatus(tx, date, classId);
        if (!status.working) closed.set(classId, status.reason);
      }
      const cutoff = institute.settings.attendanceCutoffTime;
      const result = rows.map((r) => {
        const s = sessions.find((x) => x.sectionId === r.sectionId);
        const markedAtLocal = s ? localTime(institute.timezone, s.markedAt) : null;
        return {
          ...r,
          enrolled: enrolled.get(r.sectionId) ?? 0,
          closed: closed.has(r.classId) ? (closed.get(r.classId) ?? 'Closed') : null,
          marked: Boolean(s),
          markedAt: s?.markedAt ?? null,
          markedOnTime: markedAtLocal ? markedAtLocal <= cutoff : false,
          counts: s ? { present: s.present, absent: s.absent, late: s.late, halfDay: s.halfDay, leave: s.leave } : null,
        };
      });
      const open = result.filter((r) => !r.closed);
      const marked = open.filter((r) => r.marked);
      const sum = (k: 'present' | 'absent' | 'late' | 'halfDay' | 'leave') => marked.reduce((n, r) => n + (r.counts?.[k] ?? 0), 0);
      const totalMarked = marked.reduce((n, r) => n + Object.values(r.counts!).reduce((a, b) => a + b, 0), 0);
      return {
        date,
        cutoffTime: cutoff,
        totals: {
          sections: open.length,
          sectionsMarked: marked.length,
          sectionsMarkedOnTime: marked.filter((r) => r.markedOnTime).length,
          present: sum('present'),
          absent: sum('absent'),
          late: sum('late'),
          halfDay: sum('halfDay'),
          leave: sum('leave'),
          attendancePercent: attendancePercent({ total: totalMarked, present: sum('present'), late: sum('late'), halfDay: sum('halfDay') }),
        },
        sections: result,
        notMarked: open.filter((r) => !r.marked).map((r) => ({ sectionId: r.sectionId, className: r.className, sectionName: r.sectionName })),
      };
    });
  }

  /** ATT-07 monthly register: one row per student, one column per day. */
  register(sectionId: string, month: string) {
    return this.tenantDb.run(async (tx) => {
      await this.findSection(tx, sectionId);
      const { from, to, days } = monthRange(month);
      const roster = await this.enrolled(tx, sectionId);
      const records = await tx
        .select({ studentId: studentAttendance.studentId, date: attendanceSessions.date, status: studentAttendance.status })
        .from(studentAttendance)
        .innerJoin(attendanceSessions, eq(attendanceSessions.id, studentAttendance.sessionId))
        .where(and(eq(attendanceSessions.sectionId, sectionId), eq(attendanceSessions.periodNo, 0), gte(attendanceSessions.date, from), lte(attendanceSessions.date, to)));
      const sessionDays = [...new Set(records.map((r) => r.date))].sort();
      return {
        month,
        days,
        sessionDays,
        students: roster.map((s) => {
          const mine = records.filter((r) => r.studentId === s.studentId);
          const counts = tally(mine.map((r) => r.status));
          return {
            ...s,
            days: Object.fromEntries(mine.map((r) => [r.date, CODES[r.status]])),
            ...counts,
            percent: attendancePercent(counts),
          };
        }),
      };
    });
  }

  /** ATT-07 defaulters: students below the threshold over a date range. */
  defaulters(query: DefaultersQuery) {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select({
          studentId: students.id,
          name: students.name,
          admissionNo: students.admissionNo,
          sectionId: sections.id,
          sectionName: sections.name,
          className: classes.name,
          total: sql<number>`count(*)`.mapWith(Number),
          present: sql<number>`count(*) filter (where ${studentAttendance.status} = 'present')`.mapWith(Number),
          late: sql<number>`count(*) filter (where ${studentAttendance.status} = 'late')`.mapWith(Number),
          halfDay: sql<number>`count(*) filter (where ${studentAttendance.status} = 'half_day')`.mapWith(Number),
        })
        .from(studentAttendance)
        .innerJoin(attendanceSessions, eq(attendanceSessions.id, studentAttendance.sessionId))
        .innerJoin(students, eq(students.id, studentAttendance.studentId))
        .innerJoin(sections, eq(sections.id, attendanceSessions.sectionId))
        .innerJoin(classes, eq(classes.id, sections.classId))
        .where(
          and(
            eq(attendanceSessions.periodNo, 0),
            gte(attendanceSessions.date, query.from),
            lte(attendanceSessions.date, query.to),
            query.sectionId ? eq(attendanceSessions.sectionId, query.sectionId) : undefined,
          ),
        )
        .groupBy(students.id, students.name, students.admissionNo, sections.id, sections.name, classes.name, classes.level)
        .orderBy(asc(classes.level), asc(sections.name), asc(students.name));
      return rows
        .map((r) => ({ ...r, percent: attendancePercent(r)! }))
        .filter((r) => r.percent < query.threshold);
    });
  }

  /** Institute-wide counts of marked student-days in a date range. */
  async rangeTotals(tx: Tx, from: string, to: string) {
    const [row] = await tx
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        present: sql<number>`count(*) filter (where ${studentAttendance.status} = 'present')`.mapWith(Number),
        late: sql<number>`count(*) filter (where ${studentAttendance.status} = 'late')`.mapWith(Number),
        halfDay: sql<number>`count(*) filter (where ${studentAttendance.status} = 'half_day')`.mapWith(Number),
      })
      .from(studentAttendance)
      .innerJoin(attendanceSessions, eq(attendanceSessions.id, studentAttendance.sessionId))
      .where(and(eq(attendanceSessions.periodNo, 0), gte(attendanceSessions.date, from), lte(attendanceSessions.date, to)));
    return row ?? { total: 0, present: 0, late: 0, halfDay: 0 };
  }

  /** A child's month for the parent app. */
  async childMonth(tx: Tx, studentId: string, month: string) {
    const { from, to } = monthRange(month);
    const records = await tx
      .select({ date: attendanceSessions.date, status: studentAttendance.status, remark: studentAttendance.remark })
      .from(studentAttendance)
      .innerJoin(attendanceSessions, eq(attendanceSessions.id, studentAttendance.sessionId))
      .where(and(eq(studentAttendance.studentId, studentId), eq(attendanceSessions.periodNo, 0), gte(attendanceSessions.date, from), lte(attendanceSessions.date, to)))
      .orderBy(asc(attendanceSessions.date));
    const counts = tally(records.map((r) => r.status));
    return { month, days: records, ...counts, percent: attendancePercent(counts) };
  }

  private async rosterIn(tx: Tx, sectionId: string, date: string) {
    const institute = await loadInstitute(tx);
    const section = await this.findSection(tx, sectionId);
    const day = await this.calendar.dayStatus(tx, date, section.classId);
    const [session] = await tx
      .select({ id: attendanceSessions.id, markedAt: attendanceSessions.markedAt, markedBy: attendanceSessions.markedBy })
      .from(attendanceSessions)
      .where(and(eq(attendanceSessions.sectionId, sectionId), eq(attendanceSessions.date, date), eq(attendanceSessions.periodNo, 0)));
    const saved = session
      ? new Map(
          (await tx.select({ studentId: studentAttendance.studentId, status: studentAttendance.status, remark: studentAttendance.remark }).from(studentAttendance).where(eq(studentAttendance.sessionId, session.id))).map(
            (r) => [r.studentId, r],
          ),
        )
      : new Map<string, { status: Status; remark: string | null }>();
    const today = localDate(institute.timezone);
    const editAny = currentContext().permissions.has('attendance.edit_any');
    const canEdit = day.working && date <= today && (editAny || (date === today && (await this.scope.teachesSection(tx, sectionId))));
    return {
      sectionId,
      date,
      day,
      marked: Boolean(session),
      markedAt: session?.markedAt ?? null,
      canEdit,
      students: (await this.enrolled(tx, sectionId)).map((s) => ({
        ...s,
        status: saved.get(s.studentId)?.status ?? 'present',
        remark: saved.get(s.studentId)?.remark ?? null,
      })),
    };
  }

  private async enrolled(tx: Tx, sectionId: string) {
    return tx
      .select({ studentId: students.id, name: students.name, admissionNo: students.admissionNo, rollNo: enrollments.rollNo })
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(and(eq(enrollments.sectionId, sectionId), eq(enrollments.status, 'active'), eq(students.status, 'active')))
      .orderBy(sql`${enrollments.rollNo} asc nulls last`, asc(students.name));
  }

  private async enrolledCounts(tx: Tx, sectionIds: string[]) {
    if (!sectionIds.length) return new Map<string, number>();
    const rows = await tx
      .select({ sectionId: enrollments.sectionId, n: sql<number>`count(*)`.mapWith(Number) })
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(and(inArray(enrollments.sectionId, sectionIds), eq(enrollments.status, 'active'), eq(students.status, 'active')))
      .groupBy(enrollments.sectionId);
    return new Map(rows.map((r) => [r.sectionId, r.n]));
  }

  private async findSection(tx: Tx, sectionId: string) {
    const [row] = await tx
      .select({ id: sections.id, classId: sections.classId, yearStart: academicYears.startDate, yearEnd: academicYears.endDate })
      .from(sections)
      .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
      .where(eq(sections.id, sectionId));
    if (!row) throw new AppError('not_found', 'Section not found');
    return row;
  }
}

function tally(statuses: Status[]) {
  const count = (s: Status) => statuses.filter((x) => x === s).length;
  return { total: statuses.length, present: count('present'), absent: count('absent'), late: count('late'), halfDay: count('half_day'), leave: count('leave') };
}

export function monthRange(month: string) {
  const from = `${month}-01`;
  const [y, m] = month.split('-').map(Number) as [number, number];
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return { from, to, days };
}
