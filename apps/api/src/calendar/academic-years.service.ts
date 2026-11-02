import { academicYears, and, asc, eq, sql, terms, type Tx } from '@erp/db';
import { AppError, type CreateAcademicYearInput, type CreateTermInput } from '@erp/shared';
import { Injectable } from '@nestjs/common';
import { currentTenant } from '../common/request-context.js';
import { AuditService, TenantDb } from '../core/core.module.js';

const yearColumns = {
  id: academicYears.id,
  name: academicYears.name,
  startDate: academicYears.startDate,
  endDate: academicYears.endDate,
  isCurrent: academicYears.isCurrent,
};

/** Academic years and terms (CAL-01). Every dated module hangs off the current year. */
@Injectable()
export class AcademicYearsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.tenantDb.run(async (tx) => {
      const years = await tx.select(yearColumns).from(academicYears).orderBy(asc(academicYears.startDate));
      const allTerms = await tx
        .select({
          id: terms.id,
          academicYearId: terms.academicYearId,
          name: terms.name,
          seq: terms.seq,
          startDate: terms.startDate,
          endDate: terms.endDate,
        })
        .from(terms)
        .orderBy(asc(terms.seq));
      return years.map((y) => ({ ...y, terms: allTerms.filter((t) => t.academicYearId === y.id) }));
    });
  }

  create(input: CreateAcademicYearInput) {
    return this.tenantDb.run(async (tx) => {
      const [year] = await tx
        .insert(academicYears)
        .values({ instituteId: currentTenant().instituteId, ...input })
        .returning(yearColumns);
      await this.audit.record(tx, { action: 'academic_year.create', entity: 'academic_year', entityId: year!.id, after: year });
      return year!;
    });
  }

  update(id: string, input: CreateAcademicYearInput) {
    return this.tenantDb.run(async (tx) => {
      const before = await this.find(tx, id);
      const [outside] = await tx
        .select({ id: terms.id })
        .from(terms)
        .where(
          and(
            eq(terms.academicYearId, id),
            sql`(${terms.startDate} < ${input.startDate} or ${terms.endDate} > ${input.endDate})`,
          ),
        )
        .limit(1);
      if (outside) throw new AppError('invalid', 'Existing terms fall outside the new dates');
      const [after] = await tx.update(academicYears).set(input).where(eq(academicYears.id, id)).returning(yearColumns);
      await this.audit.record(tx, { action: 'academic_year.update', entity: 'academic_year', entityId: id, before, after });
      return after!;
    });
  }

  makeCurrent(id: string) {
    return this.tenantDb.run(async (tx) => {
      const year = await this.find(tx, id);
      if (year.isCurrent) return year;
      // Clear the old flag first: a partial unique index allows one current year per institute.
      const [previous] = await tx
        .update(academicYears)
        .set({ isCurrent: false })
        .where(eq(academicYears.isCurrent, true))
        .returning({ id: academicYears.id });
      const [after] = await tx
        .update(academicYears)
        .set({ isCurrent: true })
        .where(eq(academicYears.id, id))
        .returning(yearColumns);
      await this.audit.record(tx, {
        action: 'academic_year.make_current',
        entity: 'academic_year',
        entityId: id,
        before: { currentYearId: previous?.id ?? null },
        after: { currentYearId: id },
      });
      return after!;
    });
  }

  addTerm(yearId: string, input: CreateTermInput) {
    return this.tenantDb.run(async (tx) => {
      const year = await this.find(tx, yearId);
      if (input.startDate < year.startDate || input.endDate > year.endDate) {
        throw new AppError('invalid', `Term must fall within ${year.startDate} to ${year.endDate}`);
      }
      const [overlap] = await tx
        .select({ id: terms.id })
        .from(terms)
        .where(
          and(
            eq(terms.academicYearId, yearId),
            sql`${terms.startDate} <= ${input.endDate} and ${terms.endDate} >= ${input.startDate}`,
          ),
        )
        .limit(1);
      if (overlap) throw new AppError('conflict', 'Term overlaps an existing term');
      const [{ next }] = (await tx
        .select({ next: sql<number>`coalesce(max(${terms.seq}), 0) + 1`.mapWith(Number) })
        .from(terms)
        .where(eq(terms.academicYearId, yearId))) as [{ next: number }];
      const [term] = await tx
        .insert(terms)
        .values({ instituteId: currentTenant().instituteId, academicYearId: yearId, seq: next, ...input })
        .returning({ id: terms.id, name: terms.name, seq: terms.seq, startDate: terms.startDate, endDate: terms.endDate });
      await this.audit.record(tx, { action: 'term.create', entity: 'term', entityId: term!.id, after: term });
      return term!;
    });
  }

  private async find(tx: Tx, id: string) {
    const [year] = await tx.select(yearColumns).from(academicYears).where(eq(academicYears.id, id)).for('update');
    if (!year) throw new AppError('not_found', 'Academic year not found');
    return year;
  }
}
