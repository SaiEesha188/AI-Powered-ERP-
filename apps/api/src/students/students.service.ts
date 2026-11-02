import {
  academicYears,
  and,
  asc,
  assignRole,
  classes,
  type Db,
  enrollments,
  eq,
  findOrCreateUserByPhone,
  guardians,
  inArray,
  ne,
  or,
  roles,
  sections,
  sql,
  studentGuardians,
  students,
  type Tx,
  userRoles,
  users,
} from '@erp/db';
import {
  type AdmitStudentInput,
  AppError,
  type EnrollInput,
  type GuardianInput,
  type ListStudentsQuery,
  type UpdateGuardianLinkInput,
  type UpdateStudentInput,
} from '@erp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { currentTenant } from '../common/request-context.js';
import { AuditService, SYSTEM_DB, TenantDb } from '../core/core.module.js';

const profileColumns = {
  id: students.id,
  admissionNo: students.admissionNo,
  name: students.name,
  dob: students.dob,
  gender: students.gender,
  admissionDate: students.admissionDate,
  status: students.status,
  medicalNotes: students.medicalNotes,
  customFields: students.customFields,
};

/** Phone number → global user id, resolved before the tenant transaction starts. */
export type IdentityMap = Map<string, string>;

/** Admission and student records (STU-02..05). */
@Injectable()
export class StudentsService {
  constructor(
    private readonly tenantDb: TenantDb,
    @Inject(SYSTEM_DB) private readonly systemDb: Db,
    private readonly audit: AuditService,
  ) {}

  list(query: ListStudentsQuery) {
    return this.tenantDb.run(async (tx) => {
      const yearId = await this.currentYearId(tx);
      const search = query.q ? `%${query.q.replace(/[%_\\]/g, '\\$&')}%` : undefined;
      return tx
        .select({
          id: students.id,
          admissionNo: students.admissionNo,
          name: students.name,
          gender: students.gender,
          status: students.status,
          sectionId: sections.id,
          sectionName: sections.name,
          classId: classes.id,
          className: classes.name,
          rollNo: enrollments.rollNo,
        })
        .from(students)
        .leftJoin(enrollments, and(eq(enrollments.studentId, students.id), yearId ? eq(enrollments.academicYearId, yearId) : sql`false`))
        .leftJoin(sections, eq(sections.id, enrollments.sectionId))
        .leftJoin(classes, eq(classes.id, sections.classId))
        .where(
          and(
            query.status ? eq(students.status, query.status) : undefined,
            query.sectionId ? eq(enrollments.sectionId, query.sectionId) : undefined,
            query.classId ? eq(sections.classId, query.classId) : undefined,
            search ? or(sql`${students.name} ilike ${search}`, sql`${students.admissionNo} ilike ${search}`) : undefined,
          ),
        )
        .orderBy(asc(classes.level), asc(sections.name), asc(enrollments.rollNo), asc(students.name))
        .limit(query.limit)
        .offset(query.offset);
    });
  }

  get(id: string) {
    return this.tenantDb.run((tx) => this.detail(tx, id));
  }

  async admit(input: AdmitStudentInput) {
    const identities = await this.resolveGuardians(input.guardians);
    return this.tenantDb.run(async (tx) => {
      const studentId = await this.admitInTx(tx, input, identities);
      return this.detail(tx, studentId);
    });
  }

  /** Finds or creates a login identity for each guardian phone (system connection, see UsersService). */
  async resolveGuardians(list: Pick<GuardianInput, 'phone' | 'name'>[]): Promise<IdentityMap> {
    const map: IdentityMap = new Map();
    for (const g of list) {
      if (map.has(g.phone)) continue;
      map.set(g.phone, (await findOrCreateUserByPhone(this.systemDb, g)).id);
    }
    return map;
  }

  /** Shared by single admission and bulk import. Returns the new student id. */
  async admitInTx(tx: Tx, input: AdmitStudentInput, identities: IdentityMap) {
    const { instituteId } = currentTenant();
    const admissionNo = input.admissionNo ?? (await this.nextAdmissionNo(tx));
    const [student] = await tx
      .insert(students)
      .values({
        instituteId,
        admissionNo,
        name: input.name,
        dob: input.dob ?? null,
        gender: input.gender ?? null,
        admissionDate: input.admissionDate ?? new Date().toISOString().slice(0, 10),
        medicalNotes: input.medicalNotes ?? null,
        customFields: input.customFields,
      })
      .returning({ id: students.id });
    const studentId = student!.id;

    const hasPrimary = input.guardians.some((g) => g.isPrimary);
    for (const [i, g] of input.guardians.entries()) {
      await this.linkGuardianInTx(tx, studentId, { ...g, isPrimary: hasPrimary ? g.isPrimary : i === 0 }, identities.get(g.phone)!);
    }
    if (input.sectionId) await this.enrollInTx(tx, studentId, { sectionId: input.sectionId, rollNo: input.rollNo ?? null });

    await this.audit.record(tx, {
      action: 'student.admit',
      entity: 'student',
      entityId: studentId,
      after: { admissionNo, name: input.name, sectionId: input.sectionId, guardians: input.guardians.map((g) => g.phone) },
    });
    return studentId;
  }

  update(id: string, input: UpdateStudentInput) {
    return this.tenantDb.run(async (tx) => {
      const [before] = await tx.select(profileColumns).from(students).where(eq(students.id, id)).for('update');
      if (!before) throw new AppError('not_found', 'Student not found');
      const [after] = await tx.update(students).set(input).where(eq(students.id, id)).returning(profileColumns);
      await this.audit.record(tx, { action: 'student.update', entity: 'student', entityId: id, before, after });
      return this.detail(tx, id);
    });
  }

  async addGuardian(studentId: string, input: GuardianInput) {
    const identities = await this.resolveGuardians([input]);
    return this.tenantDb.run(async (tx) => {
      await this.findStudent(tx, studentId);
      await this.linkGuardianInTx(tx, studentId, input, identities.get(input.phone)!);
      await this.audit.record(tx, { action: 'student.guardian.add', entity: 'student', entityId: studentId, after: { phone: input.phone, relation: input.relation } });
      return this.detail(tx, studentId);
    });
  }

  updateGuardian(studentId: string, guardianId: string, input: UpdateGuardianLinkInput) {
    return this.tenantDb.run(async (tx) => {
      const link = await this.findLink(tx, studentId, guardianId);
      if (input.isPrimary) {
        await tx.update(studentGuardians).set({ isPrimary: false }).where(eq(studentGuardians.studentId, studentId));
      }
      if (input.relation !== undefined || input.isPrimary !== undefined) {
        await tx
          .update(studentGuardians)
          .set({ relation: input.relation, isPrimary: input.isPrimary })
          .where(and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.guardianId, guardianId)));
      }
      // Opt-in and language belong to the person, so they apply to all their children here.
      if (input.whatsappOptIn !== undefined || input.language !== undefined) {
        await tx.update(guardians).set({ whatsappOptIn: input.whatsappOptIn, language: input.language }).where(eq(guardians.id, guardianId));
      }
      await this.audit.record(tx, { action: 'student.guardian.update', entity: 'student', entityId: studentId, before: link, after: input });
      return this.detail(tx, studentId);
    });
  }

  removeGuardian(studentId: string, guardianId: string) {
    return this.tenantDb.run(async (tx) => {
      const link = await this.findLink(tx, studentId, guardianId);
      const others = await tx
        .select({ guardianId: studentGuardians.guardianId })
        .from(studentGuardians)
        .where(and(eq(studentGuardians.studentId, studentId), ne(studentGuardians.guardianId, guardianId)));
      if (others.length === 0) throw new AppError('conflict', 'A student needs at least one guardian');
      await tx.delete(studentGuardians).where(and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.guardianId, guardianId)));
      if (link.isPrimary) {
        await tx
          .update(studentGuardians)
          .set({ isPrimary: true })
          .where(and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.guardianId, others[0]!.guardianId)));
      }
      await this.dropGuardianIfChildless(tx, guardianId);
      await this.audit.record(tx, { action: 'student.guardian.remove', entity: 'student', entityId: studentId, before: link });
    });
  }

  enroll(studentId: string, input: EnrollInput) {
    return this.tenantDb.run(async (tx) => {
      await this.findStudent(tx, studentId);
      await this.enrollInTx(tx, studentId, input);
      await this.audit.record(tx, { action: 'student.enroll', entity: 'student', entityId: studentId, after: input });
      return this.detail(tx, studentId);
    });
  }

  /** STU-04: numbers the section's active students 1..n in name order. */
  autoRollNumbers(sectionId: string) {
    return this.tenantDb.run(async (tx) => {
      const [section] = await tx.select({ id: sections.id }).from(sections).where(eq(sections.id, sectionId)).for('update');
      if (!section) throw new AppError('not_found', 'Section not found');
      const rows = await tx
        .select({ id: enrollments.id })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .where(and(eq(enrollments.sectionId, sectionId), eq(enrollments.status, 'active')))
        .orderBy(asc(students.name), asc(students.admissionNo));
      // Clear first so renumbering never collides with the unique (section, roll_no) index.
      await tx.update(enrollments).set({ rollNo: null }).where(eq(enrollments.sectionId, sectionId));
      for (const [i, row] of rows.entries()) {
        await tx.update(enrollments).set({ rollNo: i + 1 }).where(eq(enrollments.id, row.id));
      }
      await this.audit.record(tx, { action: 'section.roll_numbers.auto', entity: 'section', entityId: sectionId, after: { count: rows.length } });
      return { numbered: rows.length };
    });
  }

  async detail(tx: Tx, id: string) {
    const profile = await this.findStudent(tx, id);
    const family = await tx
      .select({
        guardianId: guardians.id,
        userId: users.id,
        name: users.name,
        phone: users.phone,
        relation: studentGuardians.relation,
        isPrimary: studentGuardians.isPrimary,
        whatsappOptIn: guardians.whatsappOptIn,
        language: guardians.language,
      })
      .from(studentGuardians)
      .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
      .innerJoin(users, eq(users.id, guardians.userId))
      .where(eq(studentGuardians.studentId, id))
      .orderBy(asc(users.name));
    const history = await tx
      .select({
        academicYearId: academicYears.id,
        academicYear: academicYears.name,
        isCurrentYear: academicYears.isCurrent,
        sectionId: sections.id,
        sectionName: sections.name,
        className: classes.name,
        rollNo: enrollments.rollNo,
        status: enrollments.status,
      })
      .from(enrollments)
      .innerJoin(academicYears, eq(academicYears.id, enrollments.academicYearId))
      .innerJoin(sections, eq(sections.id, enrollments.sectionId))
      .innerJoin(classes, eq(classes.id, sections.classId))
      .where(eq(enrollments.studentId, id))
      .orderBy(asc(academicYears.startDate));
    // Siblings share a guardian (STU-05).
    const guardianIds = family.map((g) => g.guardianId);
    const siblings = guardianIds.length
      ? await tx
          .selectDistinct({ id: students.id, name: students.name, admissionNo: students.admissionNo })
          .from(studentGuardians)
          .innerJoin(students, eq(students.id, studentGuardians.studentId))
          .where(and(inArray(studentGuardians.guardianId, guardianIds), ne(students.id, id)))
      : [];
    return { ...profile, guardians: family, enrollments: history, siblings };
  }

  private async linkGuardianInTx(tx: Tx, studentId: string, g: GuardianInput, userId: string) {
    const { instituteId } = currentTenant();
    await tx.insert(guardians).values({ instituteId, userId, whatsappOptIn: g.whatsappOptIn, language: g.language }).onConflictDoNothing();
    const [guardian] = await tx.select({ id: guardians.id }).from(guardians).where(eq(guardians.userId, userId));
    if (g.isPrimary) await tx.update(studentGuardians).set({ isPrimary: false }).where(eq(studentGuardians.studentId, studentId));
    await tx.insert(studentGuardians).values({ instituteId, studentId, guardianId: guardian!.id, relation: g.relation, isPrimary: g.isPrimary });
    // The parent role is what lets them sign in to this institute's family app.
    await assignRole(tx, { instituteId, userId, roleCode: 'parent' });
  }

  private async enrollInTx(tx: Tx, studentId: string, input: EnrollInput) {
    const [section] = await tx
      .select({ id: sections.id, academicYearId: sections.academicYearId })
      .from(sections)
      .where(eq(sections.id, input.sectionId));
    if (!section) throw new AppError('invalid', 'Unknown section');
    const values = { sectionId: section.id, academicYearId: section.academicYearId, rollNo: input.rollNo ?? null, status: 'active' as const };
    const [existing] = await tx
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.academicYearId, section.academicYearId)));
    if (existing) await tx.update(enrollments).set(values).where(eq(enrollments.id, existing.id));
    else await tx.insert(enrollments).values({ instituteId: currentTenant().instituteId, studentId, ...values });
  }

  /** Removes the guardian's parent access once they have no children left in the institute. */
  private async dropGuardianIfChildless(tx: Tx, guardianId: string) {
    const [stillLinked] = await tx.select({ s: studentGuardians.studentId }).from(studentGuardians).where(eq(studentGuardians.guardianId, guardianId)).limit(1);
    if (stillLinked) return;
    const [g] = await tx.delete(guardians).where(eq(guardians.id, guardianId)).returning({ userId: guardians.userId });
    if (!g) return;
    await tx
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.userId, g.userId),
          eq(userRoles.instituteId, currentTenant().instituteId),
          inArray(userRoles.roleId, tx.select({ id: roles.id }).from(roles).where(eq(roles.code, 'parent'))),
        ),
      );
  }

  private async nextAdmissionNo(tx: Tx) {
    // Serialise numbering per institute so concurrent admissions don't pick the same number.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('admission_no:' || ${currentTenant().instituteId}))`);
    const [row] = await tx
      .select({ max: sql<string | null>`max(${students.admissionNo}::bigint)` })
      .from(students)
      .where(sql`${students.admissionNo} ~ '^[0-9]{1,15}$'`);
    return String(Number(row?.max ?? 0) + 1);
  }

  private async currentYearId(tx: Tx) {
    const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isCurrent, true));
    return year?.id;
  }

  private async findStudent(tx: Tx, id: string) {
    const [row] = await tx.select(profileColumns).from(students).where(eq(students.id, id));
    if (!row) throw new AppError('not_found', 'Student not found');
    return row;
  }

  private async findLink(tx: Tx, studentId: string, guardianId: string) {
    const [link] = await tx
      .select({ relation: studentGuardians.relation, isPrimary: studentGuardians.isPrimary })
      .from(studentGuardians)
      .where(and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.guardianId, guardianId)));
    if (!link) throw new AppError('not_found', 'Guardian is not linked to this student');
    return link;
  }
}

