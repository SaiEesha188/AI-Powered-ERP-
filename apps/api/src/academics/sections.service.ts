import {
  academicYears,
  and,
  asc,
  classes,
  classSubjects,
  eq,
  inArray,
  or,
  sections,
  staff,
  subjects,
  teacherAssignments,
  type Tx,
  users,
} from '@erp/db';
import {
  AppError,
  type CreateAssignmentInput,
  type CreateSectionInput,
  type ListSectionsQuery,
  type UpdateSectionInput,
} from '@erp/shared';
import { Injectable } from '@nestjs/common';
import { currentTenant } from '../common/request-context.js';
import { AuditService, TenantDb } from '../core/core.module.js';

const sectionColumns = {
  id: sections.id,
  name: sections.name,
  classId: sections.classId,
  academicYearId: sections.academicYearId,
  classTeacherId: sections.classTeacherId,
};

/** Sections per academic year (ACA-01) and who teaches what in them (STF-02). */
@Injectable()
export class SectionsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
  ) {}

  list(query: ListSectionsQuery) {
    return this.tenantDb.run(async (tx) => {
      const yearId = query.academicYearId ?? (await this.currentYearId(tx));
      const rows = await tx
        .select({ ...sectionColumns, className: classes.name, classLevel: classes.level })
        .from(sections)
        .innerJoin(classes, eq(classes.id, sections.classId))
        .where(and(eq(sections.academicYearId, yearId), query.classId ? eq(sections.classId, query.classId) : undefined))
        .orderBy(asc(classes.level), asc(classes.name), asc(sections.name));
      return this.withPeople(tx, rows);
    });
  }

  create(input: CreateSectionInput) {
    return this.tenantDb.run(async (tx) => {
      const academicYearId = input.academicYearId ?? (await this.currentYearId(tx));
      const [cls] = await tx.select({ id: classes.id }).from(classes).where(eq(classes.id, input.classId));
      if (!cls) throw new AppError('invalid', 'Unknown class');
      const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.id, academicYearId));
      if (!year) throw new AppError('invalid', 'Unknown academic year');
      if (input.classTeacherId) await this.assertActiveStaff(tx, input.classTeacherId);

      const [row] = await tx
        .insert(sections)
        .values({
          instituteId: currentTenant().instituteId,
          classId: input.classId,
          academicYearId,
          name: input.name,
          classTeacherId: input.classTeacherId ?? null,
        })
        .returning(sectionColumns);
      await this.audit.record(tx, { action: 'section.create', entity: 'section', entityId: row!.id, after: row });
      return this.findWithPeople(tx, row!.id);
    });
  }

  update(id: string, input: UpdateSectionInput) {
    return this.tenantDb.run(async (tx) => {
      const before = await this.find(tx, id);
      if (input.classTeacherId) await this.assertActiveStaff(tx, input.classTeacherId);
      const [after] = await tx.update(sections).set(input).where(eq(sections.id, id)).returning(sectionColumns);
      await this.audit.record(tx, { action: 'section.update', entity: 'section', entityId: id, before, after });
      return this.findWithPeople(tx, id);
    });
  }

  remove(id: string) {
    return this.tenantDb.run(async (tx) => {
      const before = await this.find(tx, id);
      await tx.delete(sections).where(eq(sections.id, id));
      await this.audit.record(tx, { action: 'section.delete', entity: 'section', entityId: id, before });
    });
  }

  addAssignment(sectionId: string, input: CreateAssignmentInput) {
    return this.tenantDb.run(async (tx) => {
      const section = await this.find(tx, sectionId);
      const [taughtInClass] = await tx
        .select({ id: classSubjects.id })
        .from(classSubjects)
        .where(and(eq(classSubjects.classId, section.classId), eq(classSubjects.subjectId, input.subjectId)));
      if (!taughtInClass) throw new AppError('invalid', 'This subject is not in the class’s subject list');
      await this.assertActiveStaff(tx, input.staffId);

      const [row] = await tx
        .insert(teacherAssignments)
        .values({ instituteId: currentTenant().instituteId, sectionId, ...input })
        .returning({ id: teacherAssignments.id, staffId: teacherAssignments.staffId, subjectId: teacherAssignments.subjectId });
      await this.audit.record(tx, { action: 'assignment.create', entity: 'teacher_assignment', entityId: row!.id, after: { sectionId, ...input } });
      return row!;
    });
  }

  removeAssignment(sectionId: string, assignmentId: string) {
    return this.tenantDb.run(async (tx) => {
      const [before] = await tx
        .delete(teacherAssignments)
        .where(and(eq(teacherAssignments.id, assignmentId), eq(teacherAssignments.sectionId, sectionId)))
        .returning({ staffId: teacherAssignments.staffId, subjectId: teacherAssignments.subjectId });
      if (!before) throw new AppError('not_found', 'Assignment not found');
      await this.audit.record(tx, { action: 'assignment.delete', entity: 'teacher_assignment', entityId: assignmentId, before: { sectionId, ...before } });
    });
  }

  /** The caller's own teaching load in the current year: the teacher app's home screen. */
  myTeaching() {
    return this.tenantDb.run(async (tx) => {
      const { userId } = currentTenant();
      const [me] = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.userId, userId), eq(staff.status, 'active')));
      const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isCurrent, true));
      if (!me || !year) return { staffId: me?.id ?? null, academicYearId: year?.id ?? null, sections: [] };

      const rows = await tx
        .selectDistinct({ ...sectionColumns, className: classes.name, classLevel: classes.level })
        .from(sections)
        .innerJoin(classes, eq(classes.id, sections.classId))
        .leftJoin(teacherAssignments, eq(teacherAssignments.sectionId, sections.id))
        .where(and(eq(sections.academicYearId, year.id), or(eq(sections.classTeacherId, me.id), eq(teacherAssignments.staffId, me.id))))
        .orderBy(asc(classes.level), asc(sections.name));
      const detailed = await this.withPeople(tx, rows);
      return {
        staffId: me.id,
        academicYearId: year.id,
        sections: detailed.map((s) => ({
          id: s.id,
          name: s.name,
          className: s.className,
          isClassTeacher: s.classTeacherId === me.id,
          mySubjects: s.assignments.filter((a) => a.staffId === me.id).map((a) => ({ id: a.subjectId, name: a.subjectName })),
        })),
      };
    });
  }

  private async currentYearId(tx: Tx) {
    const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isCurrent, true));
    if (!year) throw new AppError('invalid', 'No current academic year; set one or pass academicYearId');
    return year.id;
  }

  private async find(tx: Tx, id: string) {
    const [row] = await tx.select(sectionColumns).from(sections).where(eq(sections.id, id)).for('update');
    if (!row) throw new AppError('not_found', 'Section not found');
    return row;
  }

  private async findWithPeople(tx: Tx, id: string) {
    const rows = await tx
      .select({ ...sectionColumns, className: classes.name, classLevel: classes.level })
      .from(sections)
      .innerJoin(classes, eq(classes.id, sections.classId))
      .where(eq(sections.id, id));
    const [section] = await this.withPeople(tx, rows);
    return section!;
  }

  private async assertActiveStaff(tx: Tx, staffId: string) {
    const [row] = await tx.select({ status: staff.status }).from(staff).where(eq(staff.id, staffId));
    if (!row) throw new AppError('invalid', 'Unknown staff member');
    if (row.status !== 'active') throw new AppError('invalid', 'This staff member has left');
  }

  /** Adds class-teacher and subject-teacher names to section rows. */
  private async withPeople<T extends { id: string; classTeacherId: string | null }>(tx: Tx, rows: T[]) {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const assignments = await tx
      .select({
        id: teacherAssignments.id,
        sectionId: teacherAssignments.sectionId,
        staffId: teacherAssignments.staffId,
        staffName: users.name,
        subjectId: subjects.id,
        subjectName: subjects.name,
      })
      .from(teacherAssignments)
      .innerJoin(staff, eq(staff.id, teacherAssignments.staffId))
      .innerJoin(users, eq(users.id, staff.userId))
      .innerJoin(subjects, eq(subjects.id, teacherAssignments.subjectId))
      .where(inArray(teacherAssignments.sectionId, ids))
      .orderBy(asc(subjects.name));
    const teacherIds = [...new Set(rows.flatMap((r) => (r.classTeacherId ? [r.classTeacherId] : [])))];
    const teachers = teacherIds.length
      ? await tx
          .select({ id: staff.id, name: users.name })
          .from(staff)
          .innerJoin(users, eq(users.id, staff.userId))
          .where(inArray(staff.id, teacherIds))
      : [];
    return rows.map((r) => ({
      ...r,
      classTeacher: teachers.find((t) => t.id === r.classTeacherId) ?? null,
      assignments: assignments.filter((a) => a.sectionId === r.id).map(({ sectionId: _, ...a }) => a),
    }));
  }
}
