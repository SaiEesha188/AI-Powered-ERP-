import { and, asc, classes, classSubjects, eq, inArray, notInArray, sections, subjects, teacherAssignments, type Tx } from '@erp/db';
import {
  AppError,
  type CreateClassInput,
  type CreateSubjectInput,
  type SetClassSubjectsInput,
  type UpdateClassInput,
  type UpdateSubjectInput,
} from '@erp/shared';
import { Injectable } from '@nestjs/common';
import { currentTenant } from '../common/request-context.js';
import { AuditService, TenantDb } from '../core/core.module.js';

const classColumns = { id: classes.id, name: classes.name, level: classes.level };
const subjectColumns = { id: subjects.id, name: subjects.name, code: subjects.code, type: subjects.type };

/** Classes (ACA-01), subjects and the subjects each class studies (ACA-02). */
@Injectable()
export class ClassesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
  ) {}

  listClasses() {
    return this.tenantDb.run((tx) => this.listClassesIn(tx));
  }

  createClass(input: CreateClassInput) {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .insert(classes)
        .values({ instituteId: currentTenant().instituteId, ...input })
        .returning(classColumns);
      await this.audit.record(tx, { action: 'class.create', entity: 'class', entityId: row!.id, after: row });
      return { ...row!, subjects: [] };
    });
  }

  updateClass(id: string, input: UpdateClassInput) {
    return this.tenantDb.run(async (tx) => {
      const [before] = await tx.select(classColumns).from(classes).where(eq(classes.id, id)).for('update');
      if (!before) throw new AppError('not_found', 'Class not found');
      const [after] = await tx.update(classes).set(input).where(eq(classes.id, id)).returning(classColumns);
      await this.audit.record(tx, { action: 'class.update', entity: 'class', entityId: id, before, after });
      return after!;
    });
  }

  /** Fails with 409 while sections still use the class (foreign key). */
  deleteClass(id: string) {
    return this.tenantDb.run(async (tx) => {
      const [before] = await tx.delete(classes).where(eq(classes.id, id)).returning(classColumns);
      if (!before) throw new AppError('not_found', 'Class not found');
      await this.audit.record(tx, { action: 'class.delete', entity: 'class', entityId: id, before });
    });
  }

  /** Replaces the class's subject list. */
  setClassSubjects(classId: string, input: SetClassSubjectsInput) {
    return this.tenantDb.run(async (tx) => {
      const { instituteId } = currentTenant();
      const [cls] = await tx.select(classColumns).from(classes).where(eq(classes.id, classId)).for('update');
      if (!cls) throw new AppError('not_found', 'Class not found');

      const ids = input.subjects.map((s) => s.subjectId);
      if (ids.length) {
        const found = await tx.select({ id: subjects.id }).from(subjects).where(inArray(subjects.id, ids));
        if (found.length !== ids.length) throw new AppError('invalid', 'Unknown subject');
      }
      await this.assertNotTaught(tx, classId, ids);

      const before = await tx
        .select({ subjectId: classSubjects.subjectId, periodsPerWeek: classSubjects.periodsPerWeek })
        .from(classSubjects)
        .where(eq(classSubjects.classId, classId));
      await tx.delete(classSubjects).where(eq(classSubjects.classId, classId));
      if (input.subjects.length) {
        await tx.insert(classSubjects).values(input.subjects.map((s) => ({ instituteId, classId, ...s })));
      }
      await this.audit.record(tx, { action: 'class.subjects.set', entity: 'class', entityId: classId, before, after: input.subjects });
      return (await this.listClassesIn(tx)).find((c) => c.id === classId)!;
    });
  }

  listSubjects() {
    return this.tenantDb.run((tx) => tx.select(subjectColumns).from(subjects).orderBy(asc(subjects.name)));
  }

  createSubject(input: CreateSubjectInput) {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .insert(subjects)
        .values({ instituteId: currentTenant().instituteId, ...input })
        .returning(subjectColumns);
      await this.audit.record(tx, { action: 'subject.create', entity: 'subject', entityId: row!.id, after: row });
      return row!;
    });
  }

  updateSubject(id: string, input: UpdateSubjectInput) {
    return this.tenantDb.run(async (tx) => {
      const [before] = await tx.select(subjectColumns).from(subjects).where(eq(subjects.id, id)).for('update');
      if (!before) throw new AppError('not_found', 'Subject not found');
      const [after] = await tx.update(subjects).set(input).where(eq(subjects.id, id)).returning(subjectColumns);
      await this.audit.record(tx, { action: 'subject.update', entity: 'subject', entityId: id, before, after });
      return after!;
    });
  }

  deleteSubject(id: string) {
    return this.tenantDb.run(async (tx) => {
      const [taught] = await tx
        .select({ id: teacherAssignments.id })
        .from(teacherAssignments)
        .where(eq(teacherAssignments.subjectId, id))
        .limit(1);
      if (taught) throw new AppError('conflict', 'Subject is assigned to teachers; remove those assignments first');
      const [before] = await tx.delete(subjects).where(eq(subjects.id, id)).returning(subjectColumns);
      if (!before) throw new AppError('not_found', 'Subject not found');
      await this.audit.record(tx, { action: 'subject.delete', entity: 'subject', entityId: id, before });
    });
  }

  private async listClassesIn(tx: Tx) {
    const rows = await tx.select(classColumns).from(classes).orderBy(asc(classes.level), asc(classes.name));
    const mapped = await tx
      .select({ classId: classSubjects.classId, periodsPerWeek: classSubjects.periodsPerWeek, ...subjectColumns })
      .from(classSubjects)
      .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
      .orderBy(asc(subjects.name));
    return rows.map((c) => ({ ...c, subjects: mapped.filter((m) => m.classId === c.id).map(({ classId: _, ...s }) => s) }));
  }

  // Dropping a subject from a class would orphan the teachers assigned to it in that class's sections.
  private async assertNotTaught(tx: Tx, classId: string, keptSubjectIds: string[]) {
    const [orphan] = await tx
      .select({ id: teacherAssignments.id })
      .from(teacherAssignments)
      .innerJoin(sections, eq(sections.id, teacherAssignments.sectionId))
      .where(
        and(
          eq(sections.classId, classId),
          keptSubjectIds.length ? notInArray(teacherAssignments.subjectId, keptSubjectIds) : undefined,
        ),
      )
      .limit(1);
    if (orphan) throw new AppError('conflict', 'A removed subject still has teachers assigned in this class; remove those assignments first');
  }
}
