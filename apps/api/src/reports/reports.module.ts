// Role dashboards (RPT-01, ATT-08) and exportable standard reports (RPT-02, BRD §11).
import {
  academicYears,
  and,
  announcementRecipients,
  announcements,
  asc,
  attendanceSessions,
  calendarEvents,
  classes,
  desc,
  enrollments,
  eq,
  gte,
  guardians,
  homework,
  homeworkSubmissions,
  inArray,
  isNull,
  lt,
  lte,
  messageDeliveries,
  messages,
  sections,
  sql,
  staff,
  students,
  subjects,
  userRoles,
  users,
} from '@erp/db';
import {
  defaultersReportQuerySchema,
  dashboardDateQuerySchema,
  homeworkReportQuerySchema,
  reachReportQuerySchema,
  registerReportQuerySchema,
  studentsReportQuerySchema,
} from '@erp/shared';
import { Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { AcademicsModule } from '../academics/academics.module.js';
import { SectionsService } from '../academics/sections.service.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { attendancePercent, AttendanceService } from '../attendance/attendance.service.js';
import { CalendarModule } from '../calendar/calendar.module.js';
import { CalendarEventsService } from '../calendar/calendar-events.service.js';
import { RequireInstitute, RequirePermissions } from '../common/decorators.js';
import { exportTable } from '../common/export.js';
import { addDays, loadInstitute, localDate } from '../common/institute.js';
import { currentTenant } from '../common/request-context.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AuditService, TenantDb } from '../core/core.module.js';
import { FamilyService } from '../family/family.service.js';
import { monthBounds } from '../notifications/engine.js';

const ACTIVE_DAYS = 7;

@Injectable()
export class DashboardsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly attendance: AttendanceService,
    private readonly calendar: CalendarEventsService,
    private readonly sectionsService: SectionsService,
    private readonly family: FamilyService,
  ) {}

  /** ATT-08 and the principal's day: attendance, gaps, homework, approvals, risks, upcoming. */
  async principal(date?: string) {
    const day = date ?? (await this.today());
    const attendance = await this.attendance.dailySummary(day);
    const atRisk = await this.attendance.defaulters({ from: addDays(day, -30), to: day, threshold: 75 });
    return this.tenantDb.run(async (tx) => {
      const { timezone } = await loadInstitute(tx);
      const homeworkToday = await tx
        .select({ sectionId: sections.id, className: classes.name, sectionName: sections.name, posted: sql<number>`count(${homework.id})`.mapWith(Number) })
        .from(sections)
        .innerJoin(classes, eq(classes.id, sections.classId))
        .innerJoin(academicYears, and(eq(academicYears.id, sections.academicYearId), eq(academicYears.isCurrent, true)))
        .leftJoin(homework, and(eq(homework.sectionId, sections.id), eq(homework.status, 'published'), sql`(${homework.createdAt} at time zone ${timezone})::date = ${day}`))
        .groupBy(sections.id, classes.name, classes.level, sections.name)
        .orderBy(asc(classes.level), asc(sections.name));
      const [pendingHolidays] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(calendarEvents).where(eq(calendarEvents.status, 'pending'));
      const [pendingCirculars] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(announcements).where(eq(announcements.status, 'pending_approval'));
      const recentCirculars = await tx
        .select({
          id: announcements.id,
          title: announcements.title,
          publishedAt: announcements.publishedAt,
          requiresAck: announcements.requiresAck,
          recipients: sql<number>`count(${announcementRecipients.userId})`.mapWith(Number),
          read: sql<number>`count(${announcementRecipients.readAt})`.mapWith(Number),
          acknowledged: sql<number>`count(${announcementRecipients.acknowledgedAt})`.mapWith(Number),
        })
        .from(announcements)
        .leftJoin(announcementRecipients, eq(announcementRecipients.announcementId, announcements.id))
        .where(eq(announcements.status, 'published'))
        .groupBy(announcements.id)
        .orderBy(desc(announcements.publishedAt))
        .limit(5);
      return {
        date: day,
        attendance: { ...attendance.totals, cutoffTime: attendance.cutoffTime, notMarked: attendance.notMarked },
        homeworkToday: { sectionsWithHomework: homeworkToday.filter((s) => s.posted > 0).length, sections: homeworkToday },
        pendingApprovals: { holidays: pendingHolidays?.n ?? 0, circulars: pendingCirculars?.n ?? 0 },
        atRisk: { threshold: 75, count: atRisk.length, students: atRisk.slice(0, 10) },
        upcomingEvents: await this.calendar.listIn(tx, { from: day, to: addDays(day, 14) }, { approvedOnly: true }),
        recentCirculars,
      };
    });
  }

  /** Management view with the BRD's adoption KPIs (§3.5): weekly active teachers and parents, reach. */
  institute() {
    return this.tenantDb.run(async (tx) => {
      const { instituteId } = currentTenant();
      const institute = await loadInstitute(tx);
      const today = localDate(institute.timezone);
      const byClass = await tx
        .select({ classId: classes.id, className: classes.name, students: sql<number>`count(${enrollments.id})`.mapWith(Number) })
        .from(classes)
        .leftJoin(sections, eq(sections.classId, classes.id))
        .leftJoin(academicYears, and(eq(academicYears.id, sections.academicYearId), eq(academicYears.isCurrent, true)))
        .leftJoin(enrollments, and(eq(enrollments.sectionId, sections.id), eq(enrollments.academicYearId, academicYears.id), eq(enrollments.status, 'active')))
        .groupBy(classes.id, classes.name, classes.level)
        .orderBy(asc(classes.level));
      const since = new Date(Date.now() - ACTIVE_DAYS * 24 * 60 * 60 * 1000);
      const adoption = async (role: 'teacher' | 'parent') => {
        const [row] = await tx
          .select({
            total: sql<number>`count(distinct ${users.id})`.mapWith(Number),
            active: sql<number>`count(distinct ${users.id}) filter (where ${users.lastLoginAt} >= ${since})`.mapWith(Number),
          })
          .from(userRoles)
          .innerJoin(users, eq(users.id, userRoles.userId))
          .where(
            and(
              eq(userRoles.instituteId, instituteId),
              role === 'teacher'
                ? inArray(userRoles.userId, tx.select({ id: staff.userId }).from(staff).where(eq(staff.status, 'active')))
                : inArray(userRoles.userId, tx.select({ id: guardians.userId }).from(guardians)),
            ),
          );
        return { total: row?.total ?? 0, activeLast7Days: row?.active ?? 0, percent: row?.total ? Math.round((row.active / row.total) * 1000) / 10 : null };
      };
      const { from, to } = monthBounds(new Date());
      const reach = await tx
        .select({ channel: messageDeliveries.channel, status: messageDeliveries.status, n: sql<number>`count(*)`.mapWith(Number) })
        .from(messageDeliveries)
        .where(and(gte(messageDeliveries.createdAt, from), lt(messageDeliveries.createdAt, to)))
        .groupBy(messageDeliveries.channel, messageDeliveries.status);
      const count = (pred: (r: (typeof reach)[number]) => boolean) => reach.filter(pred).reduce((n, r) => n + r.n, 0);
      const reached = count((r) => ['sent', 'delivered', 'read'].includes(r.status));
      const [homeworkWeek] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(homework)
        .where(and(eq(homework.status, 'published'), gte(homework.createdAt, since)));
      return {
        enrolment: { total: byClass.reduce((n, c) => n + c.students, 0), byClass },
        attendanceLast30Days: attendancePercent(await this.attendance.rangeTotals(tx, addDays(today, -30), today)),
        adoption: { teachers: await adoption('teacher'), parents: await adoption('parent') },
        communication: {
          month: today.slice(0, 7),
          byChannel: reach,
          // Queued messages (e.g. tonight's digest) are not due yet, so they are not counted as missed.
          reachedPercent: count((r) => r.status !== 'queued') ? Math.round((reached / count((r) => r.status !== 'queued')) * 1000) / 10 : null,
          readPercent: reached ? Math.round((count((r) => r.status === 'read') / reached) * 1000) / 10 : null,
        },
        homeworkPostedLast7Days: homeworkWeek?.n ?? 0,
      };
    });
  }

  /** The teacher's day: their sections, whether attendance is in, homework awaiting review. */
  async teacher() {
    const teaching = await this.sectionsService.myTeaching();
    return this.tenantDb.run(async (tx) => {
      const institute = await loadInstitute(tx);
      const today = localDate(institute.timezone);
      const ids = teaching.sections.map((s) => s.id);
      const marked = ids.length
        ? (
            await tx
              .select({ sectionId: attendanceSessions.sectionId })
              .from(attendanceSessions)
              .where(and(eq(attendanceSessions.date, today), eq(attendanceSessions.periodNo, 0), inArray(attendanceSessions.sectionId, ids)))
          ).map((r) => r.sectionId)
        : [];
      const awaitingReview = teaching.staffId
        ? await tx
            .select({ id: homework.id, title: homework.title, dueDate: homework.dueDate, sectionId: homework.sectionId, subjectName: subjects.name })
            .from(homework)
            .innerJoin(subjects, eq(subjects.id, homework.subjectId))
            .leftJoin(homeworkSubmissions, eq(homeworkSubmissions.homeworkId, homework.id))
            .where(and(eq(homework.staffId, teaching.staffId), eq(homework.status, 'published'), lte(homework.dueDate, today), gte(homework.dueDate, addDays(today, -14)), isNull(homeworkSubmissions.id)))
            .orderBy(asc(homework.dueDate))
        : [];
      const [unread] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(announcementRecipients)
        .where(and(eq(announcementRecipients.userId, currentTenant().userId), isNull(announcementRecipients.readAt)));
      return {
        date: today,
        sections: teaching.sections.map((s) => ({ ...s, attendanceMarkedToday: marked.includes(s.id) })),
        homeworkAwaitingReview: awaitingReview,
        unreadCirculars: unread?.n ?? 0,
      };
    });
  }

  /** Parent app home for one child (RPT-01 parent dashboard). */
  child(studentId: string) {
    return this.tenantDb.run(async (tx) => {
      const child = await this.family.child(tx, studentId);
      const institute = await loadInstitute(tx);
      const today = localDate(institute.timezone);
      const month = await this.attendance.childMonth(tx, studentId, today.slice(0, 7));
      const pendingHomework = child.sectionId
        ? await tx
            .select({ id: homework.id, title: homework.title, dueDate: homework.dueDate, subjectName: subjects.name })
            .from(homework)
            .innerJoin(subjects, eq(subjects.id, homework.subjectId))
            .leftJoin(homeworkSubmissions, and(eq(homeworkSubmissions.homeworkId, homework.id), eq(homeworkSubmissions.studentId, studentId)))
            .where(
              and(
                eq(homework.sectionId, child.sectionId),
                eq(homework.status, 'published'),
                gte(homework.dueDate, today),
                sql`coalesce(${homeworkSubmissions.status}, 'pending') <> 'done'`,
              ),
            )
            .orderBy(asc(homework.dueDate))
        : [];
      const [unread] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(announcementRecipients)
        .where(and(eq(announcementRecipients.userId, currentTenant().userId), isNull(announcementRecipients.readAt)));
      return {
        child,
        attendanceThisMonth: { percent: month.percent, present: month.present, absent: month.absent, late: month.late, marked: month.total },
        pendingHomework,
        upcomingEvents: await this.calendar.listIn(tx, { from: today, to: addDays(today, 14) }, { approvedOnly: true, classIds: child.classId ? [child.classId] : [] }),
        unreadCirculars: unread?.n ?? 0,
      };
    });
  }

  private today() {
    return this.tenantDb.run(async (tx) => localDate((await loadInstitute(tx)).timezone));
  }
}

@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get('principal')
  @RequirePermissions('reports.view', 'attendance.view')
  principal(@Query(new ZodPipe(dashboardDateQuerySchema)) q: z.infer<typeof dashboardDateQuerySchema>) {
    return this.dashboards.principal(q.date);
  }

  @Get('institute')
  @RequirePermissions('reports.view', 'students.view')
  institute() {
    return this.dashboards.institute();
  }

  @Get('teacher')
  @RequirePermissions('academics.view')
  teacher() {
    return this.dashboards.teacher();
  }
}

@Controller('family/children/:studentId/summary')
export class FamilySummaryController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get()
  @RequireInstitute()
  get(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.dashboards.child(studentId);
  }
}

/** BRD §11 standard reports. ?format=csv|xlsx downloads; every export is audited (§5.2). */
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly attendance: AttendanceService,
    private readonly audit: AuditService,
  ) {}

  @Get('attendance-register')
  @RequirePermissions('attendance.view')
  async register(@Query(new ZodPipe(registerReportQuerySchema)) q: z.infer<typeof registerReportQuerySchema>, @Res({ passthrough: true }) res: Response) {
    const report = await this.attendance.register(q.sectionId, q.month);
    await this.logExport('attendance_register', q);
    type Row = (typeof report.students)[number];
    return exportTable<Row>(res, q.format, `attendance-register-${q.month}`, [
      { header: 'Roll', value: (s) => s.rollNo },
      { header: 'Admission no', value: (s) => s.admissionNo },
      { header: 'Name', value: (s) => s.name },
      ...report.days.map((d) => ({ header: d.slice(8), value: (s: Row) => s.days[d] ?? '' })),
      { header: 'Present', value: (s) => s.present },
      { header: 'Absent', value: (s) => s.absent },
      { header: 'Late', value: (s) => s.late },
      { header: 'Leave', value: (s) => s.leave },
      { header: '%', value: (s) => s.percent },
    ], report.students);
  }

  @Get('attendance-defaulters')
  @RequirePermissions('attendance.view')
  async defaulters(@Query(new ZodPipe(defaultersReportQuerySchema)) q: z.infer<typeof defaultersReportQuerySchema>, @Res({ passthrough: true }) res: Response) {
    const rows = await this.attendance.defaulters(q);
    await this.logExport('attendance_defaulters', q);
    return exportTable(res, q.format, `attendance-defaulters-${q.from}-to-${q.to}`, [
      { header: 'Class', value: (r) => r.className },
      { header: 'Section', value: (r) => r.sectionName },
      { header: 'Admission no', value: (r) => r.admissionNo },
      { header: 'Name', value: (r) => r.name },
      { header: 'Days marked', value: (r) => r.total },
      { header: 'Present', value: (r) => r.present },
      { header: '%', value: (r) => r.percent },
    ], rows);
  }

  @Get('students')
  @RequirePermissions('students.view')
  async students(@Query(new ZodPipe(studentsReportQuerySchema)) q: z.infer<typeof studentsReportQuerySchema>, @Res({ passthrough: true }) res: Response) {
    const rows = await this.tenantDb.run((tx) =>
      tx
        .select({
          admissionNo: students.admissionNo,
          name: students.name,
          gender: students.gender,
          dob: students.dob,
          className: classes.name,
          sectionName: sections.name,
          rollNo: enrollments.rollNo,
          guardian: sql<string>`(select string_agg(u.name || ' ' || coalesce(u.phone, ''), '; ') from student_guardians sg join guardians g on g.id = sg.guardian_id join users u on u.id = g.user_id where sg.student_id = ${students.id})`,
        })
        .from(enrollments)
        .innerJoin(academicYears, and(eq(academicYears.id, enrollments.academicYearId), eq(academicYears.isCurrent, true)))
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .innerJoin(sections, eq(sections.id, enrollments.sectionId))
        .innerJoin(classes, eq(classes.id, sections.classId))
        .where(
          and(
            eq(students.status, 'active'),
            q.sectionId ? eq(sections.id, q.sectionId) : undefined,
            q.classId ? eq(classes.id, q.classId) : undefined,
          ),
        )
        .orderBy(asc(classes.level), asc(sections.name), sql`${enrollments.rollNo} asc nulls last`, asc(students.name)),
    );
    await this.logExport('students', q);
    return exportTable(res, q.format, 'students', [
      { header: 'Class', value: (r) => r.className },
      { header: 'Section', value: (r) => r.sectionName },
      { header: 'Roll', value: (r) => r.rollNo },
      { header: 'Admission no', value: (r) => r.admissionNo },
      { header: 'Name', value: (r) => r.name },
      { header: 'Gender', value: (r) => r.gender },
      { header: 'Date of birth', value: (r) => r.dob },
      { header: 'Guardians', value: (r) => r.guardian },
    ], rows);
  }

  /** Communication reach (sent, delivered, read) per kind of message for a month. */
  @Get('communication-reach')
  @RequirePermissions('comms.view')
  async reach(@Query(new ZodPipe(reachReportQuerySchema)) q: z.infer<typeof reachReportQuerySchema>, @Res({ passthrough: true }) res: Response) {
    const { from, to } = monthBounds(new Date(`${q.month}-01T00:00:00Z`));
    const rows = await this.tenantDb.run((tx) =>
      tx
        .select({
          eventType: messages.eventType,
          total: sql<number>`count(*)`.mapWith(Number),
          sent: sql<number>`count(*) filter (where ${messageDeliveries.status} in ('sent', 'delivered', 'read'))`.mapWith(Number),
          delivered: sql<number>`count(*) filter (where ${messageDeliveries.status} in ('delivered', 'read'))`.mapWith(Number),
          read: sql<number>`count(*) filter (where ${messageDeliveries.status} = 'read')`.mapWith(Number),
          failed: sql<number>`count(*) filter (where ${messageDeliveries.status} = 'failed')`.mapWith(Number),
        })
        .from(messageDeliveries)
        .innerJoin(messages, eq(messages.id, messageDeliveries.messageId))
        .where(and(gte(messageDeliveries.createdAt, from), lt(messageDeliveries.createdAt, to)))
        .groupBy(messages.eventType)
        .orderBy(asc(messages.eventType)),
    );
    await this.logExport('communication_reach', q);
    return exportTable(res, q.format, `communication-reach-${q.month}`, [
      { header: 'Message', value: (r) => r.eventType },
      { header: 'Total', value: (r) => r.total },
      { header: 'Sent', value: (r) => r.sent },
      { header: 'Delivered', value: (r) => r.delivered },
      { header: 'Read', value: (r) => r.read },
      { header: 'Failed', value: (r) => r.failed },
    ], rows);
  }

  /** Homework posted and completion per section (BRD §11). */
  @Get('homework')
  @RequirePermissions('homework.view')
  async homework(@Query(new ZodPipe(homeworkReportQuerySchema)) q: z.infer<typeof homeworkReportQuerySchema>, @Res({ passthrough: true }) res: Response) {
    const rows = await this.tenantDb.run((tx) =>
      tx
        .select({
          className: classes.name,
          sectionName: sections.name,
          posted: sql<number>`count(distinct ${homework.id})`.mapWith(Number),
          done: sql<number>`count(*) filter (where ${homeworkSubmissions.status} = 'done')`.mapWith(Number),
          late: sql<number>`count(*) filter (where ${homeworkSubmissions.status} = 'late')`.mapWith(Number),
          pending: sql<number>`count(*) filter (where ${homeworkSubmissions.status} = 'pending')`.mapWith(Number),
        })
        .from(homework)
        .innerJoin(sections, eq(sections.id, homework.sectionId))
        .innerJoin(classes, eq(classes.id, sections.classId))
        .leftJoin(homeworkSubmissions, eq(homeworkSubmissions.homeworkId, homework.id))
        .where(and(eq(homework.status, 'published'), gte(homework.dueDate, q.from), lte(homework.dueDate, q.to)))
        .groupBy(classes.name, classes.level, sections.name)
        .orderBy(asc(classes.level), asc(sections.name)),
    );
    await this.logExport('homework', q);
    return exportTable(res, q.format, `homework-${q.from}-to-${q.to}`, [
      { header: 'Class', value: (r) => r.className },
      { header: 'Section', value: (r) => r.sectionName },
      { header: 'Homework posted', value: (r) => r.posted },
      { header: 'Done', value: (r) => r.done },
      { header: 'Late', value: (r) => r.late },
      { header: 'Pending', value: (r) => r.pending },
    ], rows);
  }

  /** §5.2: exports are recorded in the audit log (JSON views are not exports). */
  private async logExport(report: string, query: { format: string }) {
    if (query.format === 'json') return;
    await this.tenantDb.run((tx) => this.audit.record(tx, { action: 'report.export', entity: 'report', after: { report, ...query } }));
  }
}

@Module({
  imports: [AttendanceModule, CalendarModule, AcademicsModule],
  controllers: [DashboardsController, FamilySummaryController, ReportsController],
  providers: [DashboardsService],
})
export class ReportsModule {}

