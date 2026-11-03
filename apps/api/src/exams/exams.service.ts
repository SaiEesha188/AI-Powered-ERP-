import {
  academicYears,
  and,
  asc,
  assessmentTypes,
  classes,
  classSubjects,
  enrollments,
  eq,
  examPapers,
  exams,
  examSectionLocks,
  gradeBands,
  gradeScales,
  inArray,
  marks,
  reportCards,
  sections,
  sql,
  students,
  subjects,
  type Tx,
} from '@erp/db';
import { AppError, type AssessmentTypeInput, type CreateExamInput, type GradeScaleInput, type UpdateExamInput, type UpdatePaperInput } from '@erp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { currentTenant } from '../common/request-context.js';
import { CONFIG, type Config } from '../config.js';
import { AuditService, TenantDb } from '../core/core.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export const num = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));

const DEFAULT_TYPES = [
  { name: 'Unit test', weightage: '10', seq: 1 },
  { name: 'Mid-term', weightage: '30', seq: 2 },
  { name: 'Final', weightage: '60', seq: 3 },
];

/** CBSE-style eight-point scale, the common default for Indian schools. */
const DEFAULT_BANDS = [
  { minPct: '91', maxPct: '100', grade: 'A1', points: '10', description: 'Outstanding' },
  { minPct: '81', maxPct: '90.99', grade: 'A2', points: '9', description: 'Excellent' },
  { minPct: '71', maxPct: '80.99', grade: 'B1', points: '8', description: 'Very good' },
  { minPct: '61', maxPct: '70.99', grade: 'B2', points: '7', description: 'Good' },
  { minPct: '51', maxPct: '60.99', grade: 'C1', points: '6', description: 'Satisfactory' },
  { minPct: '41', maxPct: '50.99', grade: 'C2', points: '5', description: 'Average' },
  { minPct: '33', maxPct: '40.99', grade: 'D', points: '4', description: 'Needs improvement' },
  { minPct: '0', maxPct: '32.99', grade: 'E', points: '0', description: 'Not yet passed' },
];

export const examColumns = {
  id: exams.id,
  name: exams.name,
  academicYearId: exams.academicYearId,
  assessmentTypeId: exams.assessmentTypeId,
  assessmentType: assessmentTypes.name,
  startDate: exams.startDate,
  endDate: exams.endDate,
  status: exams.status,
  gradeScaleId: exams.gradeScaleId,
  publishedAt: exams.publishedAt,
  createdAt: exams.createdAt,
};

/** Exam setup: assessment types, grade scales, exams and their papers (EX-01..03). */
@Injectable()
export class ExamsService {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- assessment types ---

  assessmentTypes() {
    return this.tenantDb.run((tx) => this.ensureTypes(tx));
  }

  createAssessmentType(input: AssessmentTypeInput) {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .insert(assessmentTypes)
        .values({ instituteId: currentTenant().instituteId, name: input.name, weightage: String(input.weightage), seq: input.seq })
        .returning();
      await this.audit.record(tx, { action: 'assessment_type.create', entity: 'assessment_type', entityId: row!.id, after: input });
      return this.ensureTypes(tx);
    });
  }

  updateAssessmentType(id: string, input: AssessmentTypeInput) {
    return this.tenantDb.run(async (tx) => {
      const [before] = await tx.select().from(assessmentTypes).where(eq(assessmentTypes.id, id));
      if (!before) throw new AppError('not_found', 'Assessment type not found');
      await tx.update(assessmentTypes).set({ name: input.name, weightage: String(input.weightage), seq: input.seq }).where(eq(assessmentTypes.id, id));
      await this.audit.record(tx, { action: 'assessment_type.update', entity: 'assessment_type', entityId: id, before, after: input });
      return this.ensureTypes(tx);
    });
  }

  deleteAssessmentType(id: string) {
    return this.tenantDb.run(async (tx) => {
      const [used] = await tx.select({ id: exams.id }).from(exams).where(eq(exams.assessmentTypeId, id)).limit(1);
      if (used) throw new AppError('conflict', 'This assessment type is used by an exam');
      const [before] = await tx.delete(assessmentTypes).where(eq(assessmentTypes.id, id)).returning();
      if (!before) throw new AppError('not_found', 'Assessment type not found');
      await this.audit.record(tx, { action: 'assessment_type.delete', entity: 'assessment_type', entityId: id, before });
    });
  }

  private async ensureTypes(tx: Tx) {
    const rows = await tx.select().from(assessmentTypes).orderBy(asc(assessmentTypes.seq), asc(assessmentTypes.name));
    if (rows.length) return rows.map((r) => ({ ...r, weightage: Number(r.weightage) }));
    await tx.insert(assessmentTypes).values(DEFAULT_TYPES.map((t) => ({ instituteId: currentTenant().instituteId, ...t })));
    return (await tx.select().from(assessmentTypes).orderBy(asc(assessmentTypes.seq))).map((r) => ({ ...r, weightage: Number(r.weightage) }));
  }

  // --- grade scales ---

  gradeScales() {
    return this.tenantDb.run((tx) => this.ensureScales(tx));
  }

  saveGradeScale(id: string | null, input: GradeScaleInput) {
    const bands = [...input.bands].sort((a, b) => b.minPct - a.minPct);
    for (let i = 1; i < bands.length; i++) {
      if (bands[i]!.maxPct >= bands[i - 1]!.minPct) throw new AppError('invalid', `Bands ${bands[i]!.grade} and ${bands[i - 1]!.grade} overlap`);
    }
    return this.tenantDb.run(async (tx) => {
      const { instituteId } = currentTenant();
      let scaleId = id;
      if (scaleId) {
        const [existing] = await tx.select({ id: gradeScales.id }).from(gradeScales).where(eq(gradeScales.id, scaleId));
        if (!existing) throw new AppError('not_found', 'Grade scale not found');
        await tx.update(gradeScales).set({ name: input.name }).where(eq(gradeScales.id, scaleId));
        await tx.delete(gradeBands).where(eq(gradeBands.gradeScaleId, scaleId));
      } else {
        const [any] = await tx.select({ id: gradeScales.id }).from(gradeScales).limit(1);
        const [row] = await tx.insert(gradeScales).values({ instituteId, name: input.name, isDefault: !any }).returning({ id: gradeScales.id });
        scaleId = row!.id;
      }
      await tx.insert(gradeBands).values(
        bands.map((b) => ({ instituteId, gradeScaleId: scaleId!, minPct: String(b.minPct), maxPct: String(b.maxPct), grade: b.grade, points: b.points === null ? null : String(b.points), description: b.description })),
      );
      await this.audit.record(tx, { action: id ? 'grade_scale.update' : 'grade_scale.create', entity: 'grade_scale', entityId: scaleId, after: input });
      return (await this.ensureScales(tx)).find((s) => s.id === scaleId)!;
    });
  }

  async ensureScales(tx: Tx) {
    let scales = await tx.select().from(gradeScales).orderBy(asc(gradeScales.name));
    if (!scales.length) {
      const { instituteId } = currentTenant();
      const [row] = await tx.insert(gradeScales).values({ instituteId, name: 'Standard (A1–E)', isDefault: true }).returning();
      await tx.insert(gradeBands).values(DEFAULT_BANDS.map((b) => ({ instituteId, gradeScaleId: row!.id, ...b })));
      scales = [row!];
    }
    const bands = await tx.select().from(gradeBands).where(inArray(gradeBands.gradeScaleId, scales.map((s) => s.id)));
    return scales.map((s) => ({
      ...s,
      bands: bands
        .filter((b) => b.gradeScaleId === s.id)
        .map((b) => ({ id: b.id, minPct: Number(b.minPct), maxPct: Number(b.maxPct), grade: b.grade, points: num(b.points), description: b.description }))
        .sort((a, b) => b.minPct - a.minPct),
    }));
  }

  // --- exams ---

  list(status?: string) {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select({ ...examColumns, papers: sql<number>`(select count(*) from exam_papers p where p.exam_id = ${exams.id})`.mapWith(Number) })
        .from(exams)
        .innerJoin(assessmentTypes, eq(assessmentTypes.id, exams.assessmentTypeId))
        .innerJoin(academicYears, and(eq(academicYears.id, exams.academicYearId), eq(academicYears.isCurrent, true)))
        .where(status ? eq(exams.status, status as 'draft') : undefined)
        .orderBy(sql`${exams.startDate} desc`);
      const classRows = rows.length
        ? await tx
            .selectDistinct({ examId: examPapers.examId, classId: classes.id, className: classes.name, level: classes.level })
            .from(examPapers)
            .innerJoin(classes, eq(classes.id, examPapers.classId))
            .where(inArray(examPapers.examId, rows.map((r) => r.id)))
        : [];
      return rows.map((r) => ({
        ...r,
        classes: classRows
          .filter((c) => c.examId === r.id)
          .sort((a, b) => a.level - b.level)
          .map((c) => ({ id: c.classId, name: c.className })),
      }));
    });
  }

  create(input: CreateExamInput) {
    return this.tenantDb.run(async (tx) => {
      const { instituteId, userId } = currentTenant();
      const [year] = await tx.select({ id: academicYears.id, start: academicYears.startDate, end: academicYears.endDate }).from(academicYears).where(eq(academicYears.isCurrent, true));
      if (!year) throw new AppError('invalid', 'Set a current academic year first');
      if (input.startDate < year.start || input.endDate > year.end) throw new AppError('invalid', 'Exam dates must fall within the current academic year');
      const [type] = await tx.select({ id: assessmentTypes.id }).from(assessmentTypes).where(eq(assessmentTypes.id, input.assessmentTypeId));
      if (!type) throw new AppError('invalid', 'Unknown assessment type');
      if (input.defaultPassMarks > input.defaultMaxMarks) throw new AppError('invalid', 'Pass marks cannot exceed maximum marks');
      const classIds = [...new Set(input.classIds)];
      const found = await tx.select({ id: classes.id }).from(classes).where(inArray(classes.id, classIds));
      if (found.length !== classIds.length) throw new AppError('invalid', 'Unknown class');
      const scale = input.gradeScaleId ? (await this.ensureScales(tx)).find((s) => s.id === input.gradeScaleId) : (await this.ensureScales(tx)).find((s) => s.isDefault);
      if (!scale) throw new AppError('invalid', 'Unknown grade scale');
      const mapped = await tx
        .select({ classId: classSubjects.classId, subjectId: classSubjects.subjectId })
        .from(classSubjects)
        .where(inArray(classSubjects.classId, classIds));
      if (!mapped.length) throw new AppError('invalid', 'The chosen classes have no subjects yet');

      const [exam] = await tx
        .insert(exams)
        .values({
          instituteId,
          academicYearId: year.id,
          assessmentTypeId: input.assessmentTypeId,
          name: input.name,
          startDate: input.startDate,
          endDate: input.endDate,
          gradeScaleId: scale.id,
          createdBy: userId,
        })
        .returning({ id: exams.id });
      await tx.insert(examPapers).values(
        mapped.map((m) => ({ instituteId, examId: exam!.id, classId: m.classId, subjectId: m.subjectId, maxMarks: String(input.defaultMaxMarks), passMarks: String(input.defaultPassMarks) })),
      );
      await this.audit.record(tx, { action: 'exam.create', entity: 'exam', entityId: exam!.id, after: { ...input, papers: mapped.length } });
      return this.detail(tx, exam!.id);
    });
  }

  get(id: string) {
    return this.tenantDb.run((tx) => this.detail(tx, id));
  }

  update(id: string, input: UpdateExamInput) {
    return this.tenantDb.run(async (tx) => {
      const before = await this.find(tx, id);
      if (before.status === 'published') throw new AppError('conflict', 'Published exams cannot be changed');
      if (input.gradeScaleId) {
        const [scale] = await tx.select({ id: gradeScales.id }).from(gradeScales).where(eq(gradeScales.id, input.gradeScaleId));
        if (!scale) throw new AppError('invalid', 'Unknown grade scale');
      }
      const startDate = input.startDate ?? before.startDate;
      const endDate = input.endDate ?? before.endDate;
      if (endDate < startDate) throw new AppError('invalid', 'endDate cannot be before startDate');
      await tx.update(exams).set({ ...input, startDate, endDate }).where(eq(exams.id, id));
      await this.audit.record(tx, { action: 'exam.update', entity: 'exam', entityId: id, before, after: input });
      return this.detail(tx, id);
    });
  }

  remove(id: string) {
    return this.tenantDb.run(async (tx) => {
      const before = await this.find(tx, id);
      if (before.status !== 'draft') throw new AppError('conflict', 'Only draft exams can be deleted');
      await tx.delete(exams).where(eq(exams.id, id));
      await this.audit.record(tx, { action: 'exam.delete', entity: 'exam', entityId: id, before });
    });
  }

  updatePaper(paperId: string, input: UpdatePaperInput) {
    return this.tenantDb.run(async (tx) => {
      const [paper] = await tx.select().from(examPapers).where(eq(examPapers.id, paperId)).for('update');
      if (!paper) throw new AppError('not_found', 'Paper not found');
      const exam = await this.find(tx, paper.examId);
      if (exam.status === 'published') throw new AppError('conflict', 'Published exams cannot be changed');
      const maxMarks = input.maxMarks ?? Number(paper.maxMarks);
      const passMarks = input.passMarks ?? Number(paper.passMarks);
      if (passMarks > maxMarks) throw new AppError('invalid', 'Pass marks cannot exceed maximum marks');
      if (input.date && (input.date < exam.startDate || input.date > exam.endDate)) throw new AppError('invalid', 'Paper date must fall within the exam dates');
      const [above] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(marks)
        .where(and(eq(marks.examPaperId, paperId), sql`${marks.marksObtained} > ${String(maxMarks)}`));
      if (above?.n) throw new AppError('conflict', `${above.n} students already have marks above ${maxMarks}`);
      await tx
        .update(examPapers)
        .set({ date: input.date, maxMarks: String(maxMarks), passMarks: String(passMarks), syllabusScope: input.syllabusScope })
        .where(eq(examPapers.id, paperId));
      await this.audit.record(tx, { action: 'exam_paper.update', entity: 'exam_paper', entityId: paperId, before: paper, after: input });
      return this.detail(tx, paper.examId);
    });
  }

  /** EX-03: publishes the date sheet and opens marks entry. */
  schedule(id: string) {
    return this.tenantDb.run(async (tx) => {
      const exam = await this.find(tx, id);
      if (exam.status !== 'draft') throw new AppError('conflict', `Exam is already ${exam.status}`);
      const [undated] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(examPapers).where(and(eq(examPapers.examId, id), sql`${examPapers.date} is null`));
      if (undated?.n) throw new AppError('invalid', `${undated.n} paper${undated.n > 1 ? 's have' : ' has'} no date yet`);
      await tx.update(exams).set({ status: 'scheduled' }).where(eq(exams.id, id));
      await this.notifications.emit(tx, 'exam.scheduled', { examId: id, link: `${this.config.PUBLIC_APP_URL}/parent/results` });
      await this.audit.record(tx, { action: 'exam.schedule', entity: 'exam', entityId: id });
      return this.detail(tx, id);
    });
  }

  async find(tx: Tx, id: string) {
    const [row] = await tx.select(examColumns).from(exams).innerJoin(assessmentTypes, eq(assessmentTypes.id, exams.assessmentTypeId)).where(eq(exams.id, id));
    if (!row) throw new AppError('not_found', 'Exam not found');
    return row;
  }

  /** Exam with papers and, per section, how far marks entry has got. */
  async detail(tx: Tx, id: string) {
    const exam = await this.find(tx, id);
    const papers = await tx
      .select({
        id: examPapers.id,
        classId: examPapers.classId,
        className: classes.name,
        classLevel: classes.level,
        subjectId: examPapers.subjectId,
        subjectName: subjects.name,
        date: examPapers.date,
        maxMarks: examPapers.maxMarks,
        passMarks: examPapers.passMarks,
        syllabusScope: examPapers.syllabusScope,
      })
      .from(examPapers)
      .innerJoin(classes, eq(classes.id, examPapers.classId))
      .innerJoin(subjects, eq(subjects.id, examPapers.subjectId))
      .where(eq(examPapers.examId, id))
      .orderBy(asc(classes.level), asc(examPapers.date), asc(subjects.name));
    const classIds = [...new Set(papers.map((p) => p.classId))];
    const sectionRows = classIds.length
      ? await tx
          .select({ id: sections.id, name: sections.name, classId: sections.classId, className: classes.name, classTeacherId: sections.classTeacherId, students: sql<number>`(select count(*) from enrollments e join students s on s.id = e.student_id where e.section_id = ${sections.id} and e.status = 'active' and s.status = 'active')`.mapWith(Number) })
          .from(sections)
          .innerJoin(classes, eq(classes.id, sections.classId))
          .where(and(inArray(sections.classId, classIds), eq(sections.academicYearId, exam.academicYearId)))
          .orderBy(asc(classes.level), asc(sections.name))
      : [];
    const entered = sectionRows.length
      ? await tx
          .select({ sectionId: enrollments.sectionId, paperId: marks.examPaperId, n: sql<number>`count(*)`.mapWith(Number) })
          .from(marks)
          .innerJoin(examPapers, eq(examPapers.id, marks.examPaperId))
          .innerJoin(enrollments, and(eq(enrollments.studentId, marks.studentId), eq(enrollments.academicYearId, exam.academicYearId), eq(enrollments.status, 'active')))
          .where(and(eq(examPapers.examId, id), sql`(${marks.marksObtained} is not null or ${marks.isAbsent})`))
          .groupBy(enrollments.sectionId, marks.examPaperId)
      : [];
    const locks = await tx.select({ sectionId: examSectionLocks.sectionId, lockedAt: examSectionLocks.lockedAt }).from(examSectionLocks).where(eq(examSectionLocks.examId, id));
    const [cards] = await tx
      .select({ total: sql<number>`count(*)`.mapWith(Number), published: sql<number>`count(*) filter (where ${reportCards.status} = 'published')`.mapWith(Number) })
      .from(reportCards)
      .where(eq(reportCards.examId, id));
    return {
      ...exam,
      papers: papers.map((p) => ({ ...p, maxMarks: Number(p.maxMarks), passMarks: Number(p.passMarks) })),
      // A section with nobody enrolled does not sit the exam, so it never blocks locking or report cards.
      sections: sectionRows.filter((s) => s.students > 0).map((s) => {
        const own = papers.filter((p) => p.classId === s.classId);
        const done = own.reduce((n, p) => n + (entered.find((e) => e.sectionId === s.id && e.paperId === p.id)?.n ?? 0), 0);
        const lock = locks.find((l) => l.sectionId === s.id);
        return { ...s, papers: own.length, expected: own.length * s.students, entered: done, locked: Boolean(lock), lockedAt: lock?.lockedAt ?? null };
      }),
      reportCards: { total: cards?.total ?? 0, published: cards?.published ?? 0 },
    };
  }

  /** Students of a section with their marks for one paper (shared with MarksService). */
  async roster(tx: Tx, sectionId: string) {
    return tx
      .select({ studentId: students.id, name: students.name, rollNo: enrollments.rollNo, admissionNo: students.admissionNo })
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(and(eq(enrollments.sectionId, sectionId), eq(enrollments.status, 'active'), eq(students.status, 'active')))
      .orderBy(sql`${enrollments.rollNo} asc nulls last`, asc(students.name));
  }
}
