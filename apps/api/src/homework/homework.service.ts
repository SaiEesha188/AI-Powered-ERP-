import {
  and,
  asc,
  classes,
  classSubjects,
  desc,
  enrollments,
  eq,
  gte,
  homework,
  homeworkAttachments,
  homeworkSubmissions,
  inArray,
  lte,
  sections,
  sql,
  staff,
  students,
  subjects,
  type Tx,
  users,
} from '@erp/db';
import { AppError, type CreateHomeworkInput, type HomeworkCompletionInput, type ListHomeworkQuery, type UpdateHomeworkInput } from '@erp/shared';
import { Injectable } from '@nestjs/common';
import { TeachingScope } from '../academics/teaching-scope.js';
import { CalendarEventsService } from '../calendar/calendar-events.service.js';
import { loadInstitute, localDate } from '../common/institute.js';
import { currentTenant } from '../common/request-context.js';
import { AuditService, TenantDb } from '../core/core.module.js';
import { FilesService } from '../files/files.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const summaryColumns = {
  id: homework.id,
  sectionId: homework.sectionId,
  sectionName: sections.name,
  className: classes.name,
  subjectId: homework.subjectId,
  subjectName: subjects.name,
  staffId: homework.staffId,
  teacherName: users.name,
  title: homework.title,
  instructions: homework.instructions,
  dueDate: homework.dueDate,
  links: homework.links,
  isUrgent: homework.isUrgent,
  status: homework.status,
  createdAt: homework.createdAt,
};

/** Homework (M11): teachers post once; families get one digest a day. */
@Injectable()
export class HomeworkService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly scope: TeachingScope,
    private readonly calendar: CalendarEventsService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  create(input: CreateHomeworkInput) {
    return this.tenantDb.run(async (tx) => {
      const { instituteId } = currentTenant();
      const staffId = await this.scope.staffId(tx);
      if (!staffId) throw new AppError('forbidden', 'Only staff can post homework');
      const institute = await loadInstitute(tx);
      if (input.dueDate < localDate(institute.timezone)) throw new AppError('invalid', 'Due date is in the past');
      await this.files.assertExist(tx, input.fileIds);

      const created = [];
      for (const sectionId of input.sectionIds) {
        const [section] = await tx.select({ id: sections.id, classId: sections.classId }).from(sections).where(eq(sections.id, sectionId));
        if (!section) throw new AppError('invalid', 'Unknown section');
        const [studied] = await tx
          .select({ id: classSubjects.id })
          .from(classSubjects)
          .where(and(eq(classSubjects.classId, section.classId), eq(classSubjects.subjectId, input.subjectId)));
        if (!studied) throw new AppError('invalid', 'This subject is not in the class’s subject list');
        if (!(await this.scope.teachesSubjectOrClass(tx, sectionId, input.subjectId))) {
          throw new AppError('forbidden', 'You can post homework only for sections and subjects you teach');
        }
        // A due date on a holiday or weekly off moves to the next working day (BR-10).
        const dueDate = await this.calendar.nextWorkingDay(tx, input.dueDate, section.classId);
        const [row] = await tx
          .insert(homework)
          .values({
            instituteId,
            sectionId,
            subjectId: input.subjectId,
            staffId,
            title: input.title,
            instructions: input.instructions ?? null,
            dueDate,
            links: input.links,
            isUrgent: input.isUrgent,
          })
          .returning({ id: homework.id, dueDate: homework.dueDate });
        if (input.fileIds.length) {
          await tx.insert(homeworkAttachments).values([...new Set(input.fileIds)].map((fileId) => ({ instituteId, homeworkId: row!.id, fileId })));
        }
        await this.notifications.emit(tx, 'homework.posted', { homeworkId: row!.id });
        await this.audit.record(tx, { action: 'homework.create', entity: 'homework', entityId: row!.id, after: { ...input, sectionId, dueDate } });
        created.push({ id: row!.id, sectionId, dueDate, dueDateShifted: dueDate !== input.dueDate });
      }
      return created;
    });
  }

  list(query: ListHomeworkQuery) {
    return this.tenantDb.run(async (tx) => {
      const mine = query.mine === 'true' ? await this.scope.staffId(tx) : undefined;
      if (mine === null) return [];
      const rows = await this.baseQuery(tx)
        .where(
          and(
            query.sectionId ? eq(homework.sectionId, query.sectionId) : undefined,
            query.from ? gte(homework.dueDate, query.from) : undefined,
            query.to ? lte(homework.dueDate, query.to) : undefined,
            mine ? eq(homework.staffId, mine) : undefined,
          ),
        )
        .orderBy(desc(homework.dueDate), asc(classes.level), asc(sections.name));
      const counts = rows.length
        ? await tx
            .select({
              homeworkId: homeworkSubmissions.homeworkId,
              done: sql<number>`count(*) filter (where ${homeworkSubmissions.status} = 'done')`.mapWith(Number),
              late: sql<number>`count(*) filter (where ${homeworkSubmissions.status} = 'late')`.mapWith(Number),
              pending: sql<number>`count(*) filter (where ${homeworkSubmissions.status} = 'pending')`.mapWith(Number),
            })
            .from(homeworkSubmissions)
            .where(inArray(homeworkSubmissions.homeworkId, rows.map((r) => r.id)))
            .groupBy(homeworkSubmissions.homeworkId)
        : [];
      const result = [];
      for (const r of rows) {
        result.push({
          ...r,
          attachments: await this.attachments(tx, r.id),
          completion: (({ homeworkId: _, ...c }) => c)(counts.find((c) => c.homeworkId === r.id) ?? { homeworkId: r.id, done: 0, late: 0, pending: 0 }),
        });
      }
      return result;
    });
  }

  get(id: string) {
    return this.tenantDb.run(async (tx) => {
      const hw = await this.find(tx, id);
      const roster = await tx
        .select({
          studentId: students.id,
          name: students.name,
          rollNo: enrollments.rollNo,
          status: homeworkSubmissions.status,
          feedback: homeworkSubmissions.feedback,
          score: homeworkSubmissions.score,
        })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .leftJoin(homeworkSubmissions, and(eq(homeworkSubmissions.homeworkId, id), eq(homeworkSubmissions.studentId, students.id)))
        .where(and(eq(enrollments.sectionId, hw.sectionId), eq(enrollments.status, 'active'), eq(students.status, 'active')))
        .orderBy(sql`${enrollments.rollNo} asc nulls last`, asc(students.name));
      return { ...hw, attachments: await this.attachments(tx, id), students: roster };
    });
  }

  update(id: string, input: UpdateHomeworkInput) {
    return this.tenantDb.run(async (tx) => {
      const before = await this.findOwn(tx, id);
      const changes = { ...input };
      if (input.dueDate) {
        const institute = await loadInstitute(tx);
        if (input.dueDate < localDate(institute.timezone)) throw new AppError('invalid', 'Due date is in the past');
        const [section] = await tx.select({ classId: sections.classId }).from(sections).where(eq(sections.id, before.sectionId));
        changes.dueDate = await this.calendar.nextWorkingDay(tx, input.dueDate, section!.classId);
      }
      await tx.update(homework).set(changes).where(eq(homework.id, id));
      const after = await this.find(tx, id);
      await this.audit.record(tx, { action: 'homework.update', entity: 'homework', entityId: id, before, after });
      return after;
    });
  }

  cancel(id: string) {
    return this.tenantDb.run(async (tx) => {
      const before = await this.findOwn(tx, id);
      await tx.update(homework).set({ status: 'cancelled' }).where(eq(homework.id, id));
      await this.audit.record(tx, { action: 'homework.cancel', entity: 'homework', entityId: id, before });
    });
  }

  /** HW-05: the teacher records done / pending / late, with optional feedback and score. */
  complete(id: string, input: HomeworkCompletionInput) {
    return this.tenantDb.run(async (tx) => {
      const { instituteId, userId } = currentTenant();
      const hw = await this.find(tx, id);
      if (hw.status !== 'published') throw new AppError('conflict', 'This homework was cancelled');
      if (!(await this.scope.teachesSubjectOrClass(tx, hw.sectionId, hw.subjectId))) {
        throw new AppError('forbidden', 'You can review homework only for sections and subjects you teach');
      }
      const enrolled = await tx
        .select({ id: enrollments.studentId })
        .from(enrollments)
        .where(and(eq(enrollments.sectionId, hw.sectionId), eq(enrollments.status, 'active'), inArray(enrollments.studentId, input.records.map((r) => r.studentId))));
      if (enrolled.length !== new Set(input.records.map((r) => r.studentId)).size) throw new AppError('invalid', 'A student in the list is not in this section');
      await tx
        .insert(homeworkSubmissions)
        .values(
          input.records.map((r) => ({
            instituteId,
            homeworkId: id,
            studentId: r.studentId,
            status: r.status,
            feedback: r.feedback ?? null,
            score: r.score === undefined ? null : String(r.score),
            reviewedBy: userId,
          })),
        )
        .onConflictDoUpdate({
          target: [homeworkSubmissions.homeworkId, homeworkSubmissions.studentId],
          set: { status: sql`excluded.status`, feedback: sql`excluded.feedback`, score: sql`excluded.score`, reviewedBy: userId, updatedAt: new Date() },
        });
      await this.audit.record(tx, { action: 'homework.complete', entity: 'homework', entityId: id, after: input.records });
      return { updated: input.records.length };
    });
  }

  /** A child's homework due in a range, with the teacher's completion mark (parent app). */
  async forChild(tx: Tx, studentId: string, sectionId: string | null, from: string, to: string) {
    if (!sectionId) return [];
    const rows = await this.baseQuery(tx)
      .where(and(eq(homework.sectionId, sectionId), eq(homework.status, 'published'), gte(homework.dueDate, from), lte(homework.dueDate, to)))
      .orderBy(asc(homework.dueDate), asc(subjects.name));
    const marks = rows.length
      ? await tx
          .select({ homeworkId: homeworkSubmissions.homeworkId, status: homeworkSubmissions.status, feedback: homeworkSubmissions.feedback })
          .from(homeworkSubmissions)
          .where(and(eq(homeworkSubmissions.studentId, studentId), inArray(homeworkSubmissions.homeworkId, rows.map((r) => r.id))))
      : [];
    const result = [];
    for (const r of rows) {
      const mark = marks.find((m) => m.homeworkId === r.id);
      result.push({ ...r, attachments: await this.attachments(tx, r.id), completion: mark?.status ?? null, feedback: mark?.feedback ?? null });
    }
    return result;
  }

  private baseQuery(tx: Tx) {
    return tx
      .select(summaryColumns)
      .from(homework)
      .innerJoin(sections, eq(sections.id, homework.sectionId))
      .innerJoin(classes, eq(classes.id, sections.classId))
      .innerJoin(subjects, eq(subjects.id, homework.subjectId))
      .innerJoin(staff, eq(staff.id, homework.staffId))
      .innerJoin(users, eq(users.id, staff.userId))
      .$dynamic();
  }

  private async attachments(tx: Tx, homeworkId: string) {
    const ids = await tx.select({ fileId: homeworkAttachments.fileId }).from(homeworkAttachments).where(eq(homeworkAttachments.homeworkId, homeworkId));
    return this.files.links(tx, ids.map((r) => r.fileId));
  }

  private async find(tx: Tx, id: string) {
    const [row] = await this.baseQuery(tx).where(eq(homework.id, id));
    if (!row) throw new AppError('not_found', 'Homework not found');
    return row;
  }

  /** Only the teacher who posted homework may edit or cancel it. */
  private async findOwn(tx: Tx, id: string) {
    const row = await this.find(tx, id);
    if (row.staffId !== (await this.scope.staffId(tx))) throw new AppError('forbidden', 'Only the teacher who posted this homework can change it');
    if (row.status !== 'published') throw new AppError('conflict', 'This homework was cancelled');
    return row;
  }
}
