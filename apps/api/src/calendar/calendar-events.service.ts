import { and, asc, calendarEventClasses, calendarEvents, classes, eq, gte, homework, inArray, lte, ne, or, sections, type Tx } from '@erp/db';
import { AppError, type CreateCalendarEventInput, type ListCalendarQuery } from '@erp/shared';
import { Injectable } from '@nestjs/common';
import { addDays, isoWeekday, loadInstitute } from '../common/institute.js';
import { currentContext, currentTenant } from '../common/request-context.js';
import { AuditService, TenantDb } from '../core/core.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const eventColumns = {
  id: calendarEvents.id,
  type: calendarEvents.type,
  title: calendarEvents.title,
  description: calendarEvents.description,
  startDate: calendarEvents.startDate,
  endDate: calendarEvents.endDate,
  scope: calendarEvents.scope,
  status: calendarEvents.status,
};

const BLOCKING_TYPES = ['holiday'] as const;

export interface DayStatus {
  working: boolean;
  /** Why the day is closed: "weekly off" or the holiday's title. */
  reason?: string;
  halfDay: boolean;
}

/** Holidays and events (CAL-03..06) and the working-day rules every dated module relies on. */
@Injectable()
export class CalendarEventsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  list(query: ListCalendarQuery) {
    return this.tenantDb.run((tx) => this.listIn(tx, query));
  }

  async listIn(tx: Tx, query: ListCalendarQuery, filter: { approvedOnly?: boolean; classIds?: string[] } = {}) {
    const rows = await tx
      .select(eventColumns)
      .from(calendarEvents)
      .where(
        and(
          lte(calendarEvents.startDate, query.to),
          gte(calendarEvents.endDate, query.from),
          filter.approvedOnly ? eq(calendarEvents.status, 'approved') : undefined,
          // Family view: everything for everyone, plus events of their children's classes.
          filter.classIds
            ? or(
                eq(calendarEvents.scope, 'all'),
                filter.classIds.length
                  ? and(
                      eq(calendarEvents.scope, 'classes'),
                      inArray(
                        calendarEvents.id,
                        tx.select({ id: calendarEventClasses.eventId }).from(calendarEventClasses).where(inArray(calendarEventClasses.classId, filter.classIds)),
                      ),
                    )
                  : undefined,
              )
            : undefined,
        ),
      )
      .orderBy(asc(calendarEvents.startDate), asc(calendarEvents.title));
    const links = rows.length
      ? await tx
          .select({ eventId: calendarEventClasses.eventId, classId: classes.id, className: classes.name })
          .from(calendarEventClasses)
          .innerJoin(classes, eq(classes.id, calendarEventClasses.classId))
          .where(inArray(calendarEventClasses.eventId, rows.map((r) => r.id)))
      : [];
    return rows.map((r) => ({ ...r, classes: links.filter((l) => l.eventId === r.id).map(({ eventId: _, ...c }) => c) }));
  }

  create(input: CreateCalendarEventInput) {
    return this.tenantDb.run(async (tx) => {
      const { instituteId, userId } = currentTenant();
      if (input.classIds.length) {
        const found = await tx.select({ id: classes.id }).from(classes).where(inArray(classes.id, input.classIds));
        if (found.length !== new Set(input.classIds).size) throw new AppError('invalid', 'Unknown class');
      }
      const { settings } = await loadInstitute(tx);
      const needsApproval =
        (BLOCKING_TYPES as readonly string[]).includes(input.type) &&
        settings.holidayApprovalRequired &&
        !currentContext().permissions.has('calendar.approve');

      const [row] = await tx
        .insert(calendarEvents)
        .values({
          instituteId,
          type: input.type,
          title: input.title,
          description: input.description ?? null,
          startDate: input.startDate,
          endDate: input.endDate,
          scope: input.scope,
          status: needsApproval ? 'pending' : 'approved',
          createdBy: userId,
          decidedBy: needsApproval ? null : userId,
          decidedAt: needsApproval ? null : new Date(),
        })
        .returning(eventColumns);
      if (input.classIds.length) {
        await tx.insert(calendarEventClasses).values([...new Set(input.classIds)].map((classId) => ({ instituteId, eventId: row!.id, classId })));
      }
      await this.audit.record(tx, { action: 'calendar_event.create', entity: 'calendar_event', entityId: row!.id, after: { ...row, classIds: input.classIds } });
      if (row!.status === 'approved') await this.publish(tx, row!.id);
      return (await this.listIn(tx, { from: row!.startDate, to: row!.endDate })).find((e) => e.id === row!.id)!;
    });
  }

  decide(id: string, decision: 'approve' | 'reject') {
    return this.tenantDb.run(async (tx) => {
      const [before] = await tx.select(eventColumns).from(calendarEvents).where(eq(calendarEvents.id, id)).for('update');
      if (!before) throw new AppError('not_found', 'Event not found');
      if (before.status !== 'pending') throw new AppError('conflict', `Event is already ${before.status}`);
      const [after] = await tx
        .update(calendarEvents)
        .set({ status: decision === 'approve' ? 'approved' : 'rejected', decidedBy: currentTenant().userId, decidedAt: new Date() })
        .where(eq(calendarEvents.id, id))
        .returning(eventColumns);
      await this.audit.record(tx, { action: `calendar_event.${decision}`, entity: 'calendar_event', entityId: id, before, after });
      if (decision === 'approve') await this.publish(tx, id);
      return after!;
    });
  }

  remove(id: string) {
    return this.tenantDb.run(async (tx) => {
      const [before] = await tx.delete(calendarEvents).where(eq(calendarEvents.id, id)).returning(eventColumns);
      if (!before) throw new AppError('not_found', 'Event not found');
      await this.audit.record(tx, { action: 'calendar_event.delete', entity: 'calendar_event', entityId: id, before });
    });
  }

  dayStatusFor(date: string, classId: string) {
    return this.tenantDb.run((tx) => this.dayStatus(tx, date, classId));
  }

  /**
   * BR-01: whether students of a class attend on a date. Closed on weekly offs and approved
   * holidays that cover everyone or that class; staff-only holidays do not close classes.
   */
  async dayStatus(tx: Tx, date: string, classId: string): Promise<DayStatus> {
    const { settings } = await loadInstitute(tx);
    if (!settings.workingDays.includes(isoWeekday(date))) return { working: false, reason: 'Weekly off', halfDay: false };
    const events = await tx
      .select({ id: calendarEvents.id, type: calendarEvents.type, title: calendarEvents.title, scope: calendarEvents.scope })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.status, 'approved'),
          inArray(calendarEvents.type, ['holiday', 'half_day']),
          ne(calendarEvents.scope, 'staff'),
          lte(calendarEvents.startDate, date),
          gte(calendarEvents.endDate, date),
        ),
      );
    let halfDay = false;
    for (const e of events) {
      if (e.scope === 'classes') {
        const [applies] = await tx
          .select({ c: calendarEventClasses.classId })
          .from(calendarEventClasses)
          .where(and(eq(calendarEventClasses.eventId, e.id), eq(calendarEventClasses.classId, classId)));
        if (!applies) continue;
      }
      if (e.type === 'holiday') return { working: false, reason: e.title, halfDay: false };
      halfDay = true;
    }
    return { working: true, halfDay };
  }

  /** An approved event takes effect: families are told and homework due on a new holiday moves (BR-10). */
  private async publish(tx: Tx, eventId: string) {
    await this.notifications.emit(tx, 'calendar.published', { eventId });
    const [event] = await tx
      .select({ type: calendarEvents.type, scope: calendarEvents.scope, startDate: calendarEvents.startDate, endDate: calendarEvents.endDate })
      .from(calendarEvents)
      .where(eq(calendarEvents.id, eventId));
    if (!event || event.type !== 'holiday' || event.scope === 'staff') return;
    const classIds =
      event.scope === 'classes'
        ? (await tx.select({ id: calendarEventClasses.classId }).from(calendarEventClasses).where(eq(calendarEventClasses.eventId, eventId))).map((r) => r.id)
        : undefined;
    const due = await tx
      .select({ id: homework.id, dueDate: homework.dueDate, classId: sections.classId })
      .from(homework)
      .innerJoin(sections, eq(sections.id, homework.sectionId))
      .where(
        and(
          eq(homework.status, 'published'),
          gte(homework.dueDate, event.startDate),
          lte(homework.dueDate, event.endDate),
          classIds ? inArray(sections.classId, classIds) : undefined,
        ),
      );
    for (const hw of due) {
      const dueDate = await this.nextWorkingDay(tx, hw.dueDate, hw.classId);
      await tx.update(homework).set({ dueDate }).where(eq(homework.id, hw.id));
      await this.audit.record(tx, { action: 'homework.due_date.shifted', entity: 'homework', entityId: hw.id, before: { dueDate: hw.dueDate }, after: { dueDate, holidayId: eventId } });
    }
  }

  /** BR-10: the first working day on or after the date (looks ahead at most 60 days). */
  async nextWorkingDay(tx: Tx, date: string, classId: string): Promise<string> {
    for (let i = 0, d = date; i < 60; i++, d = addDays(d, 1)) {
      if ((await this.dayStatus(tx, d, classId)).working) return d;
    }
    return date;
  }
}
