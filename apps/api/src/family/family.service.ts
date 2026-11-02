import { academicYears, and, asc, classes, enrollments, eq, guardians, inArray, sections, studentGuardians, students, type Tx } from '@erp/db';
import { AppError } from '@erp/shared';
import { Injectable } from '@nestjs/common';
import { currentTenant } from '../common/request-context.js';

export interface Child {
  id: string;
  name: string;
  admissionNo: string;
  relation: string;
  sectionId: string | null;
  sectionName: string | null;
  className: string | null;
  classId: string | null;
  rollNo: number | null;
}

/**
 * "Own" access for parents (BRD §5.1, USR-04/05). Every /family route goes through here: a
 * parent reaches a student only through their own guardian link in the current institute.
 */
@Injectable()
export class FamilyService {
  /** All children of the signed-in guardian, with their current-year section. */
  async children(tx: Tx): Promise<Child[]> {
    const { userId } = currentTenant();
    return tx
      .select({
        id: students.id,
        name: students.name,
        admissionNo: students.admissionNo,
        relation: studentGuardians.relation,
        sectionId: sections.id,
        sectionName: sections.name,
        className: classes.name,
        classId: classes.id,
        rollNo: enrollments.rollNo,
      })
      .from(guardians)
      .innerJoin(studentGuardians, eq(studentGuardians.guardianId, guardians.id))
      .innerJoin(students, eq(students.id, studentGuardians.studentId))
      .leftJoin(
        enrollments,
        and(
          eq(enrollments.studentId, students.id),
          inArray(enrollments.academicYearId, tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isCurrent, true))),
        ),
      )
      .leftJoin(sections, eq(sections.id, enrollments.sectionId))
      .leftJoin(classes, eq(classes.id, sections.classId))
      .where(and(eq(guardians.userId, userId), eq(students.status, 'active')))
      .orderBy(asc(students.name));
  }

  /** The child if the caller is their guardian; otherwise 404 so other students' ids reveal nothing. */
  async child(tx: Tx, studentId: string): Promise<Child> {
    const child = (await this.children(tx)).find((c) => c.id === studentId);
    if (!child) throw new AppError('not_found', 'Student not found');
    return child;
  }
}
