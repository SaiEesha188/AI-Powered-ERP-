import { academicYears, and, eq, or, sections, staff, teacherAssignments, type Tx } from '@erp/db';
import { Injectable } from '@nestjs/common';
import { currentTenant } from '../common/request-context.js';

/**
 * BR-04 / USR-04: a teacher acts only on sections they teach, as class teacher or through a
 * subject assignment. Callers with an institute-wide permission (e.g. attendance.edit_any)
 * skip this check.
 */
@Injectable()
export class TeachingScope {
  /** The caller's active staff record in the current institute, if any. */
  async staffId(tx: Tx): Promise<string | null> {
    const [row] = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.userId, currentTenant().userId), eq(staff.status, 'active')));
    return row?.id ?? null;
  }

  /** Teaches the subject in the section, or is its class teacher (who may act for any subject). */
  async teachesSubjectOrClass(tx: Tx, sectionId: string, subjectId: string): Promise<boolean> {
    if (await this.teachesSection(tx, sectionId, { subjectId })) return true;
    const me = await this.staffId(tx);
    if (!me) return false;
    const [row] = await tx.select({ id: sections.id }).from(sections).where(and(eq(sections.id, sectionId), eq(sections.classTeacherId, me)));
    return Boolean(row);
  }

  async teachesSection(tx: Tx, sectionId: string, opts: { subjectId?: string } = {}): Promise<boolean> {
    const { userId } = currentTenant();
    const [row] = await tx
      .select({ id: sections.id })
      .from(sections)
      .innerJoin(staff, and(eq(staff.userId, userId), eq(staff.status, 'active')))
      .leftJoin(teacherAssignments, and(eq(teacherAssignments.sectionId, sections.id), eq(teacherAssignments.staffId, staff.id)))
      .where(
        and(
          eq(sections.id, sectionId),
          opts.subjectId
            ? eq(teacherAssignments.subjectId, opts.subjectId)
            : or(eq(sections.classTeacherId, staff.id), eq(teacherAssignments.staffId, staff.id)),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /** Teaches the subject in any current-year section of the class, or is class teacher of one. */
  async teachesInClass(tx: Tx, classId: string, subjectId: string): Promise<boolean> {
    const me = await this.staffId(tx);
    if (!me) return false;
    const [row] = await tx
      .select({ id: sections.id })
      .from(sections)
      .innerJoin(academicYears, and(eq(academicYears.id, sections.academicYearId), eq(academicYears.isCurrent, true)))
      .leftJoin(teacherAssignments, and(eq(teacherAssignments.sectionId, sections.id), eq(teacherAssignments.staffId, me), eq(teacherAssignments.subjectId, subjectId)))
      .where(and(eq(sections.classId, classId), or(eq(sections.classTeacherId, me), eq(teacherAssignments.staffId, me))))
      .limit(1);
    return Boolean(row);
  }
}
