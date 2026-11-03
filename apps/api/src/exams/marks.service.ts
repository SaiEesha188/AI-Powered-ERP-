import { academicYears, and, asc, classes, eq, examPapers, exams, examSectionLocks, inArray, marks, sections, sql, subjects, teacherAssignments, type Tx } from '@erp/db';
import { AppError, type EnterMarksInput } from '@erp/shared';
import { Injectable } from '@nestjs/common';
import { TeachingScope } from '../academics/teaching-scope.js';
import { currentContext, currentTenant } from '../common/request-context.js';
import { AuditService, TenantDb } from '../core/core.module.js';
import { ExamsService, num } from './exams.service.js';

/** Marks entry, validation and class-teacher moderation (MK-01..03, BR-04, BR-06, BR-07). */
@Injectable()
export class MarksService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly exams: ExamsService,
    private readonly scope: TeachingScope,
    private readonly audit: AuditService,
  ) {}

  grid(paperId: string, sectionId: string) {
    return this.tenantDb.run((tx) => this.gridIn(tx, paperId, sectionId));
  }

  private async gridIn(tx: Tx, paperId: string, sectionId: string) {
    {
      const paper = await this.paperFor(tx, paperId, sectionId);
      const roster = await this.exams.roster(tx, sectionId);
      const existing = await tx.select().from(marks).where(and(eq(marks.examPaperId, paperId), inArray(marks.studentId, roster.map((r) => r.studentId).concat('00000000-0000-0000-0000-000000000000'))));
      const locked = await this.isLocked(tx, paper.examId, sectionId);
      const held = currentContext().permissions;
      const scoped = held.has('marks.enter') && (await this.scope.teachesSubjectOrClass(tx, sectionId, paper.subjectId));
      const canEdit = paper.status === 'scheduled' || paper.status === 'locked' ? (locked ? held.has('report_cards.publish') : scoped || held.has('report_cards.publish')) : false;
      return {
        paper,
        locked,
        canEdit,
        students: roster.map((s) => {
          const m = existing.find((x) => x.studentId === s.studentId);
          return { ...s, marks: num(m?.marksObtained), absent: m?.isAbsent ?? false };
        }),
      };
    }
  }

  enter(paperId: string, input: EnterMarksInput) {
    return this.tenantDb.run(async (tx) => {
      const { instituteId, userId } = currentTenant();
      const paper = await this.paperFor(tx, paperId, input.sectionId);
      if (paper.status === 'draft') throw new AppError('conflict', 'Publish the date sheet before entering marks');
      if (paper.status === 'published') throw new AppError('conflict', 'Results are published; marks can no longer change');
      const held = currentContext().permissions;
      const locked = await this.isLocked(tx, paper.examId, input.sectionId);
      if (locked) {
        // BR-07: after moderation only the principal (publish right) may change marks, with a reason.
        if (!held.has('report_cards.publish')) throw new AppError('forbidden', 'This section is locked; ask the principal to correct these marks');
        if (!input.reason) throw new AppError('invalid', 'A reason is required to change locked marks');
      } else if (!held.has('report_cards.publish') && !(await this.scope.teachesSubjectOrClass(tx, input.sectionId, paper.subjectId))) {
        throw new AppError('forbidden', 'You can enter marks only for subjects and sections you teach');
      }
      const roster = new Set((await this.exams.roster(tx, input.sectionId)).map((r) => r.studentId));
      for (const e of input.entries) {
        if (!roster.has(e.studentId)) throw new AppError('invalid', 'A student in the list is not in this section');
        if (e.marks !== null && e.marks > paper.maxMarks) throw new AppError('invalid', `Marks cannot exceed ${paper.maxMarks}`);
      }
      const before = await tx
        .select({ studentId: marks.studentId, marksObtained: marks.marksObtained, isAbsent: marks.isAbsent })
        .from(marks)
        .where(and(eq(marks.examPaperId, paperId), inArray(marks.studentId, input.entries.map((e) => e.studentId))));
      await tx
        .insert(marks)
        .values(input.entries.map((e) => ({ instituteId, examPaperId: paperId, studentId: e.studentId, marksObtained: e.absent || e.marks === null ? null : String(e.marks), isAbsent: e.absent, enteredBy: userId })))
        .onConflictDoUpdate({
          target: [marks.examPaperId, marks.studentId],
          set: { marksObtained: sql`excluded.marks_obtained`, isAbsent: sql`excluded.is_absent`, enteredBy: userId, updatedAt: new Date() },
        });
      await this.audit.record(tx, {
        action: locked ? 'marks.correct' : 'marks.enter',
        entity: 'exam_paper',
        entityId: paperId,
        before: Object.fromEntries(before.map((b) => [b.studentId, b.isAbsent ? 'absent' : num(b.marksObtained)])),
        after: { sectionId: input.sectionId, entries: Object.fromEntries(input.entries.map((e) => [e.studentId, e.absent ? 'absent' : e.marks])), reason: input.reason ?? null },
      });
      return this.gridIn(tx, paperId, input.sectionId);
    });
  }

  /** MK-03: the class teacher confirms every paper is complete for their section and locks it. */
  lockSection(examId: string, sectionId: string) {
    return this.tenantDb.run(async (tx) => {
      const { instituteId, userId } = currentTenant();
      const exam = await this.exams.find(tx, examId);
      if (exam.status !== 'scheduled' && exam.status !== 'locked') throw new AppError('conflict', `Exam is ${exam.status}`);
      await this.assertClassTeacher(tx, sectionId);
      if (await this.isLocked(tx, examId, sectionId)) throw new AppError('conflict', 'Already locked');
      const missing = await this.missingEntries(tx, examId, sectionId);
      if (missing.length) throw new AppError('invalid', `Marks are missing: ${missing.slice(0, 3).join('; ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}`);
      await tx.insert(examSectionLocks).values({ instituteId, examId, sectionId, lockedBy: userId });
      await this.audit.record(tx, { action: 'marks.lock', entity: 'exam', entityId: examId, after: { sectionId } });
      await this.refreshExamStatus(tx, examId);
      return this.exams.detail(tx, examId);
    });
  }

  /** The principal reopens a section for corrections. */
  unlockSection(examId: string, sectionId: string) {
    return this.tenantDb.run(async (tx) => {
      const exam = await this.exams.find(tx, examId);
      if (exam.status === 'published') throw new AppError('conflict', 'Results are published');
      const removed = await tx.delete(examSectionLocks).where(and(eq(examSectionLocks.examId, examId), eq(examSectionLocks.sectionId, sectionId))).returning();
      if (!removed.length) throw new AppError('not_found', 'Section is not locked');
      await tx.update(exams).set({ status: 'scheduled' }).where(eq(exams.id, examId));
      await this.audit.record(tx, { action: 'marks.unlock', entity: 'exam', entityId: examId, after: { sectionId } });
      return this.exams.detail(tx, examId);
    });
  }

  /** The teacher app's to-do: papers in open exams for sections the caller teaches, with progress. */
  myTasks() {
    return this.tenantDb.run(async (tx) => {
      const me = await this.scope.staffId(tx);
      if (!me) return [];
      const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isCurrent, true));
      if (!year) return [];
      const mine = await tx
        .select({ sectionId: sections.id, sectionName: sections.name, classId: sections.classId, className: classes.name, subjectId: teacherAssignments.subjectId, isClassTeacher: sql<boolean>`${sections.classTeacherId} = ${me}` })
        .from(sections)
        .innerJoin(classes, eq(classes.id, sections.classId))
        .leftJoin(teacherAssignments, and(eq(teacherAssignments.sectionId, sections.id), eq(teacherAssignments.staffId, me)))
        .where(and(eq(sections.academicYearId, year.id), sql`(${sections.classTeacherId} = ${me} or ${teacherAssignments.staffId} = ${me})`));
      if (!mine.length) return [];
      const open = await tx
        .select({ examId: exams.id, examName: exams.name, status: exams.status, paperId: examPapers.id, classId: examPapers.classId, subjectId: examPapers.subjectId, subjectName: subjects.name, date: examPapers.date, maxMarks: examPapers.maxMarks })
        .from(examPapers)
        .innerJoin(exams, eq(exams.id, examPapers.examId))
        .innerJoin(subjects, eq(subjects.id, examPapers.subjectId))
        .where(and(inArray(exams.status, ['scheduled', 'locked']), inArray(examPapers.classId, [...new Set(mine.map((m) => m.classId))])))
        .orderBy(asc(examPapers.date), asc(subjects.name));
      const tasks = [];
      for (const p of open) {
        const sectionsFor = mine.filter((m) => m.classId === p.classId && (m.isClassTeacher || m.subjectId === p.subjectId));
        for (const s of [...new Map(sectionsFor.map((x) => [x.sectionId, x])).values()]) {
          const roster = await this.exams.roster(tx, s.sectionId);
          if (!roster.length) continue;
          const [done] = await tx
            .select({ n: sql<number>`count(*)`.mapWith(Number) })
            .from(marks)
            .where(and(eq(marks.examPaperId, p.paperId), inArray(marks.studentId, roster.map((r) => r.studentId).concat('00000000-0000-0000-0000-000000000000')), sql`(${marks.marksObtained} is not null or ${marks.isAbsent})`));
          tasks.push({ ...p, maxMarks: Number(p.maxMarks), sectionId: s.sectionId, sectionName: s.sectionName, className: s.className, students: roster.length, entered: done?.n ?? 0, locked: await this.isLocked(tx, p.examId, s.sectionId), isClassTeacher: s.isClassTeacher });
        }
      }
      return tasks;
    });
  }

  private async paperFor(tx: Tx, paperId: string, sectionId: string) {
    const [paper] = await tx
      .select({ id: examPapers.id, examId: examPapers.examId, classId: examPapers.classId, subjectId: examPapers.subjectId, subjectName: subjects.name, maxMarks: examPapers.maxMarks, passMarks: examPapers.passMarks, status: exams.status, examName: exams.name, academicYearId: exams.academicYearId })
      .from(examPapers)
      .innerJoin(exams, eq(exams.id, examPapers.examId))
      .innerJoin(subjects, eq(subjects.id, examPapers.subjectId))
      .where(eq(examPapers.id, paperId));
    if (!paper) throw new AppError('not_found', 'Paper not found');
    const [section] = await tx.select({ classId: sections.classId, academicYearId: sections.academicYearId }).from(sections).where(eq(sections.id, sectionId));
    if (!section || section.classId !== paper.classId || section.academicYearId !== paper.academicYearId) throw new AppError('invalid', 'This section does not sit this paper');
    return { ...paper, maxMarks: Number(paper.maxMarks), passMarks: Number(paper.passMarks) };
  }

  async isLocked(tx: Tx, examId: string, sectionId: string) {
    const [row] = await tx.select({ s: examSectionLocks.sectionId }).from(examSectionLocks).where(and(eq(examSectionLocks.examId, examId), eq(examSectionLocks.sectionId, sectionId)));
    return Boolean(row);
  }

  private async assertClassTeacher(tx: Tx, sectionId: string) {
    const me = await this.scope.staffId(tx);
    const [row] = await tx.select({ id: sections.id }).from(sections).where(and(eq(sections.id, sectionId), eq(sections.classTeacherId, me ?? '00000000-0000-0000-0000-000000000000')));
    if (!row && !currentContext().permissions.has('report_cards.publish')) throw new AppError('forbidden', 'Only the class teacher can lock this section');
  }

  /** "Subject: n students" for every paper with blank, non-absent entries. */
  async missingEntries(tx: Tx, examId: string, sectionId: string) {
    const [section] = await tx.select({ classId: sections.classId }).from(sections).where(eq(sections.id, sectionId));
    if (!section) throw new AppError('not_found', 'Section not found');
    const papers = await tx
      .select({ id: examPapers.id, subject: subjects.name })
      .from(examPapers)
      .innerJoin(subjects, eq(subjects.id, examPapers.subjectId))
      .where(and(eq(examPapers.examId, examId), eq(examPapers.classId, section.classId)));
    const roster = await this.exams.roster(tx, sectionId);
    const out: string[] = [];
    for (const p of papers) {
      const [done] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(marks)
        .where(and(eq(marks.examPaperId, p.id), inArray(marks.studentId, roster.map((r) => r.studentId).concat('00000000-0000-0000-0000-000000000000')), sql`(${marks.marksObtained} is not null or ${marks.isAbsent})`));
      const missing = roster.length - (done?.n ?? 0);
      if (missing > 0) out.push(`${p.subject}: ${missing} student${missing > 1 ? 's' : ''}`);
    }
    return out;
  }

  /** The exam becomes "locked" once every section of every class in it is locked. */
  private async refreshExamStatus(tx: Tx, examId: string) {
    const exam = await this.exams.detail(tx, examId);
    const allLocked = exam.sections.length > 0 && exam.sections.every((s) => s.locked);
    await tx.update(exams).set({ status: allLocked ? 'locked' : 'scheduled' }).where(eq(exams.id, examId));
  }
}

