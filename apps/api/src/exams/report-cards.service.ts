import {
  academicYears,
  and,
  asc,
  attendanceSessions,
  enrollments,
  eq,
  examPapers,
  exams,
  gte,
  inArray,
  lte,
  marks,
  type ReportCardData,
  type ReportCardSubject,
  reportCards,
  sections,
  sql,
  studentAttendance,
  students,
  subjects,
  type Tx,
} from '@erp/db';
import { AppError } from '@erp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { TeachingScope } from '../academics/teaching-scope.js';
import { attendancePercent } from '../attendance/attendance.service.js';
import { currentContext, currentTenant } from '../common/request-context.js';
import { CONFIG, type Config } from '../config.js';
import { AuditService, TenantDb } from '../core/core.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ExamsService, num } from './exams.service.js';

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Report cards (MK-04..10): computed from locked marks, published by the principal. */
@Injectable()
export class ReportCardsService {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly tenantDb: TenantDb,
    private readonly exams: ExamsService,
    private readonly scope: TeachingScope,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** MK-04: totals, percentages, grades, ranks and attendance for every student in the exam. */
  generate(examId: string) {
    return this.tenantDb.run(async (tx) => {
      const { instituteId } = currentTenant();
      const exam = await this.exams.detail(tx, examId);
      if (exam.status === 'published') throw new AppError('conflict', 'Results are already published');
      if (exam.status !== 'locked') {
        const open = exam.sections.filter((s) => !s.locked).map((s) => `${s.className} ${s.name}`);
        throw new AppError('invalid', `Every section must be locked by its class teacher first. Still open: ${open.join(', ')}`);
      }
      const scale = (await this.exams.ensureScales(tx)).find((s) => s.id === exam.gradeScaleId) ?? (await this.exams.ensureScales(tx)).find((s) => s.isDefault)!;
      const gradeFor = (pct: number | null) => {
        if (pct === null) return { grade: null, points: null };
        const band = scale.bands.find((b) => pct >= b.minPct && pct <= b.maxPct) ?? scale.bands.find((b) => pct >= b.minPct) ?? null;
        return { grade: band?.grade ?? null, points: band?.points ?? null };
      };
      const [year] = await tx.select({ start: academicYears.startDate }).from(academicYears).where(eq(academicYears.id, exam.academicYearId));
      const existingRemarks = new Map((await tx.select({ studentId: reportCards.studentId, remarks: reportCards.remarks }).from(reportCards).where(eq(reportCards.examId, examId))).map((r) => [r.studentId, r.remarks]));

      let generated = 0;
      for (const section of exam.sections) {
        const papers = exam.papers.filter((p) => p.classId === section.classId);
        const roster = await this.exams.roster(tx, section.id);
        if (!roster.length) continue;
        const allMarks = await tx
          .select({ paperId: marks.examPaperId, studentId: marks.studentId, marks: marks.marksObtained, absent: marks.isAbsent })
          .from(marks)
          .where(and(inArray(marks.examPaperId, papers.map((p) => p.id)), inArray(marks.studentId, roster.map((r) => r.studentId))));
        const averages = new Map<string, number | null>();
        for (const p of papers) {
          const present = allMarks.filter((m) => m.paperId === p.id && m.marks !== null).map((m) => (Number(m.marks) / p.maxMarks) * 100);
          averages.set(p.id, present.length ? round1(present.reduce((a, b) => a + b, 0) / present.length) : null);
        }
        const computed = [];
        for (const s of roster) {
          const subjectsOut: ReportCardSubject[] = papers.map((p) => {
            const m = allMarks.find((x) => x.paperId === p.id && x.studentId === s.studentId);
            const got = num(m?.marks);
            const pct = got === null ? null : round1((got / p.maxMarks) * 100);
            return { subjectId: p.subjectId, subject: p.subjectName, maxMarks: p.maxMarks, marks: got, absent: m?.absent ?? false, percent: pct, ...gradeFor(pct), passed: got === null ? false : got >= p.passMarks, classAverage: averages.get(p.id) ?? null };
          });
          const totalMarks = subjectsOut.reduce((n, x) => n + (x.marks ?? 0), 0);
          const totalMax = subjectsOut.reduce((n, x) => n + x.maxMarks, 0);
          const percent = totalMax ? round1((totalMarks / totalMax) * 100) : null;
          const attendance = await this.attendanceSince(tx, s.studentId, year?.start ?? exam.startDate, exam.endDate);
          computed.push({ student: s, data: { subjects: subjectsOut, totalMarks, totalMax, percent, ...gradeFor(percent), passed: subjectsOut.every((x) => x.passed), rank: null as number | null, sectionSize: roster.length, attendancePercent: attendance, sectionName: section.name, className: section.className, rollNo: s.rollNo } });
        }
        // Rank by total; equal totals share a rank.
        for (const c of computed) c.data.rank = 1 + computed.filter((o) => o.data.totalMarks > c.data.totalMarks).length;
        for (const c of computed) {
          await tx
            .insert(reportCards)
            .values({ instituteId, examId, studentId: c.student.studentId, data: c.data, remarks: existingRemarks.get(c.student.studentId) ?? null })
            .onConflictDoUpdate({ target: [reportCards.examId, reportCards.studentId], set: { data: c.data, updatedAt: new Date() } });
          generated += 1;
        }
      }
      await this.audit.record(tx, { action: 'report_cards.generate', entity: 'exam', entityId: examId, after: { generated } });
      return { generated };
    });
  }

  list(examId: string) {
    return this.tenantDb.run(async (tx) => {
      await this.exams.find(tx, examId);
      const rows = await tx
        .select({ id: reportCards.id, studentId: reportCards.studentId, name: students.name, admissionNo: students.admissionNo, data: reportCards.data, remarks: reportCards.remarks, status: reportCards.status })
        .from(reportCards)
        .innerJoin(students, eq(students.id, reportCards.studentId))
        .where(eq(reportCards.examId, examId))
        .orderBy(asc(students.name));
      return rows
        .map((r) => ({ id: r.id, studentId: r.studentId, name: r.name, admissionNo: r.admissionNo, className: r.data.className, sectionName: r.data.sectionName, rollNo: r.data.rollNo, percent: r.data.percent, grade: r.data.grade, rank: r.data.rank, passed: r.data.passed, hasRemarks: Boolean(r.remarks), status: r.status }))
        .sort((a, b) => a.className.localeCompare(b.className) || a.sectionName.localeCompare(b.sectionName) || (a.rank ?? 999) - (b.rank ?? 999));
    });
  }

  get(id: string) {
    return this.tenantDb.run((tx) => this.detail(tx, id));
  }

  /** MK-06/07: the class teacher writes remarks (AI drafts come later) before publishing. */
  setRemarks(id: string, remarks: string | null) {
    return this.tenantDb.run(async (tx) => {
      const card = await this.detail(tx, id);
      if (card.status === 'published') throw new AppError('conflict', 'Published report cards cannot be edited');
      // Remarks are the class teacher's (MK-06); the principal may also edit them.
      const me = await this.scope.staffId(tx);
      const [section] = await tx
        .select({ id: sections.id })
        .from(sections)
        .innerJoin(enrollments, and(eq(enrollments.sectionId, sections.id), eq(enrollments.studentId, card.studentId), eq(enrollments.status, 'active')))
        .where(eq(sections.classTeacherId, me ?? '00000000-0000-0000-0000-000000000000'))
        .limit(1);
      if (!currentContext().permissions.has('report_cards.publish') && !section) throw new AppError('forbidden', 'Only the class teacher can write remarks for this student');
      await tx.update(reportCards).set({ remarks, remarksAiDrafted: false }).where(eq(reportCards.id, id));
      await this.audit.record(tx, { action: 'report_card.remarks', entity: 'report_card', entityId: id, before: { remarks: card.remarks }, after: { remarks } });
      return this.detail(tx, id);
    });
  }

  /** MK-08: the principal publishes; families are told and can see marks from now on (BR-05). */
  publish(examId: string) {
    return this.tenantDb.run(async (tx) => {
      const exam = await this.exams.detail(tx, examId);
      if (exam.status === 'published') throw new AppError('conflict', 'Already published');
      if (exam.status !== 'locked') throw new AppError('invalid', 'Lock every section and generate report cards first');
      const [count] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(reportCards).where(eq(reportCards.examId, examId));
      if (!count?.n) throw new AppError('invalid', 'Generate report cards first');
      const now = new Date();
      await tx.update(reportCards).set({ status: 'published', publishedAt: now }).where(eq(reportCards.examId, examId));
      await tx.update(exams).set({ status: 'published', publishedAt: now }).where(eq(exams.id, examId));
      await this.notifications.emit(tx, 'report_card.published', { examId, link: `${this.config.PUBLIC_APP_URL}/parent/results` });
      await this.audit.record(tx, { action: 'report_cards.publish', entity: 'exam', entityId: examId, after: { reportCards: count.n } });
      return this.exams.detail(tx, examId);
    });
  }

  /** MK-10: pass rate and subject averages per section. */
  analysis(examId: string) {
    return this.tenantDb.run(async (tx) => {
      await this.exams.find(tx, examId);
      const rows = await tx.select({ data: reportCards.data }).from(reportCards).where(eq(reportCards.examId, examId));
      const bySection = new Map<string, ReportCardData[]>();
      for (const r of rows) {
        const key = `${r.data.className} · ${r.data.sectionName}`;
        bySection.set(key, [...(bySection.get(key) ?? []), r.data]);
      }
      const sectionsOut = [...bySection.entries()].map(([section, cards]) => {
        const subjectNames = [...new Set(cards.flatMap((c) => c.subjects.map((s) => s.subject)))];
        return {
          section,
          students: cards.length,
          passed: cards.filter((c) => c.passed).length,
          averagePercent: round1(cards.reduce((n, c) => n + (c.percent ?? 0), 0) / cards.length),
          topper: [...cards].sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0]?.percent ?? null,
          subjects: subjectNames.map((name) => {
            const got = cards.map((c) => c.subjects.find((s) => s.subject === name)).filter((s): s is ReportCardSubject => Boolean(s));
            const present = got.filter((s) => s.percent !== null);
            return {
              subject: name,
              average: present.length ? round1(present.reduce((n, s) => n + s.percent!, 0) / present.length) : null,
              passed: got.filter((s) => s.passed).length,
              highest: present.length ? Math.max(...present.map((s) => s.percent!)) : null,
              absent: got.filter((s) => s.absent).length,
            };
          }),
        };
      });
      const all = rows.map((r) => r.data);
      return { students: all.length, passed: all.filter((c) => c.passed).length, averagePercent: all.length ? round1(all.reduce((n, c) => n + (c.percent ?? 0), 0) / all.length) : null, sections: sectionsOut };
    });
  }

  /** Published results for a child (parent app). */
  async forChild(tx: Tx, studentId: string) {
    return tx
      .select({ id: reportCards.id, examId: exams.id, examName: exams.name, assessmentType: sql<string>`(select name from assessment_types t where t.id = ${exams.assessmentTypeId})`, startDate: exams.startDate, endDate: exams.endDate, publishedAt: reportCards.publishedAt, percent: sql<number | null>`(${reportCards.data}->>'percent')::numeric`.mapWith((v) => num(v)), grade: sql<string | null>`${reportCards.data}->>'grade'`, passed: sql<boolean>`(${reportCards.data}->>'passed')::boolean` })
      .from(reportCards)
      .innerJoin(exams, eq(exams.id, reportCards.examId))
      .where(and(eq(reportCards.studentId, studentId), eq(reportCards.status, 'published')))
      .orderBy(sql`${exams.startDate} desc`);
  }

  async childCard(tx: Tx, studentId: string, cardId: string) {
    const card = await this.detail(tx, cardId);
    if (card.studentId !== studentId || card.status !== 'published') throw new AppError('not_found', 'Report card not found');
    return card;
  }

  /** Upcoming and recent exams with the date sheet, for the parent app (EX-03). */
  async scheduleForChild(tx: Tx, classId: string | null) {
    if (!classId) return [];
    const rows = await tx
      .select({ examId: exams.id, examName: exams.name, status: exams.status, startDate: exams.startDate, endDate: exams.endDate, paperId: examPapers.id, subject: subjects.name, date: examPapers.date, maxMarks: examPapers.maxMarks, syllabusScope: examPapers.syllabusScope })
      .from(examPapers)
      .innerJoin(exams, eq(exams.id, examPapers.examId))
      .innerJoin(subjects, eq(subjects.id, examPapers.subjectId))
      .where(and(eq(examPapers.classId, classId), inArray(exams.status, ['scheduled', 'locked', 'published'])))
      .orderBy(sql`${exams.startDate} desc`, asc(examPapers.date));
    const byExam = new Map<string, { examId: string; examName: string; status: string; startDate: string; endDate: string; papers: { subject: string; date: string | null; maxMarks: number; syllabusScope: string | null }[] }>();
    for (const r of rows) {
      const e = byExam.get(r.examId) ?? { examId: r.examId, examName: r.examName, status: r.status, startDate: r.startDate, endDate: r.endDate, papers: [] };
      e.papers.push({ subject: r.subject, date: r.date, maxMarks: Number(r.maxMarks), syllabusScope: r.syllabusScope });
      byExam.set(r.examId, e);
    }
    return [...byExam.values()];
  }

  async detail(tx: Tx, id: string) {
    const [row] = await tx
      .select({ id: reportCards.id, examId: reportCards.examId, examName: exams.name, startDate: exams.startDate, endDate: exams.endDate, studentId: reportCards.studentId, studentName: students.name, admissionNo: students.admissionNo, data: reportCards.data, remarks: reportCards.remarks, status: reportCards.status, publishedAt: reportCards.publishedAt })
      .from(reportCards)
      .innerJoin(exams, eq(exams.id, reportCards.examId))
      .innerJoin(students, eq(students.id, reportCards.studentId))
      .where(eq(reportCards.id, id));
    if (!row) throw new AppError('not_found', 'Report card not found');
    return row;
  }

  private async attendanceSince(tx: Tx, studentId: string, from: string, to: string) {
    const [row] = await tx
      .select({ total: sql<number>`count(*)`.mapWith(Number), present: sql<number>`count(*) filter (where ${studentAttendance.status} = 'present')`.mapWith(Number), late: sql<number>`count(*) filter (where ${studentAttendance.status} = 'late')`.mapWith(Number), halfDay: sql<number>`count(*) filter (where ${studentAttendance.status} = 'half_day')`.mapWith(Number) })
      .from(studentAttendance)
      .innerJoin(attendanceSessions, eq(attendanceSessions.id, studentAttendance.sessionId))
      .where(and(eq(studentAttendance.studentId, studentId), eq(attendanceSessions.periodNo, 0), gte(attendanceSessions.date, from), lte(attendanceSessions.date, to)));
    return row ? attendancePercent(row) : null;
  }
}

