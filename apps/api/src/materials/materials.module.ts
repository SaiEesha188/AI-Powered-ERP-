import {
  and,
  asc,
  classes,
  classSubjects,
  eq,
  exists,
  inArray,
  materials,
  materialSections,
  ne,
  notExists,
  or,
  sections,
  subjects,
  type Tx,
  users,
} from '@erp/db';
import {
  AppError,
  type CreateMaterialInput,
  createMaterialSchema,
  familyMaterialsQuerySchema,
  type ListMaterialsQuery,
  listMaterialsQuerySchema,
  type UpdateMaterialInput,
  updateMaterialSchema,
} from '@erp/shared';
import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import { AcademicsModule } from '../academics/academics.module.js';
import { TeachingScope } from '../academics/teaching-scope.js';
import { RequireInstitute, RequirePermissions } from '../common/decorators.js';
import { currentContext, currentTenant } from '../common/request-context.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AuditService, TenantDb } from '../core/core.module.js';
import { FamilyService } from '../family/family.service.js';
import { FilesService } from '../files/files.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const columns = {
  id: materials.id,
  classId: materials.classId,
  className: classes.name,
  subjectId: materials.subjectId,
  subjectName: subjects.name,
  chapter: materials.chapter,
  title: materials.title,
  description: materials.description,
  type: materials.type,
  url: materials.url,
  fileId: materials.fileId,
  audience: materials.audience,
  createdBy: materials.createdBy,
  createdByName: users.name,
  createdAt: materials.createdAt,
};

/** Learning materials (M12): one library organised by class, subject and chapter. */
@Injectable()
export class MaterialsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly scope: TeachingScope,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  list(q: ListMaterialsQuery) {
    return this.tenantDb.run(async (tx) => {
      const rows = await this.base(tx)
        .where(
          and(
            q.classId ? eq(materials.classId, q.classId) : undefined,
            q.subjectId ? eq(materials.subjectId, q.subjectId) : undefined,
            q.chapter ? eq(materials.chapter, q.chapter) : undefined,
          ),
        )
        .orderBy(asc(classes.level), asc(subjects.name), asc(materials.chapter), asc(materials.title));
      return this.decorate(tx, rows);
    });
  }

  create(input: CreateMaterialInput) {
    return this.tenantDb.run(async (tx) => {
      const { instituteId, userId } = currentTenant();
      await this.assertMayManage(tx, input.classId, input.subjectId);
      await this.assertSections(tx, input.classId, input.sectionIds);
      if (input.fileId) await this.files.assertExist(tx, [input.fileId]);
      const [row] = await tx
        .insert(materials)
        .values({
          instituteId,
          classId: input.classId,
          subjectId: input.subjectId,
          chapter: input.chapter ?? null,
          title: input.title,
          description: input.description ?? null,
          type: input.type,
          url: input.url ?? null,
          fileId: input.fileId ?? null,
          audience: input.audience,
          createdBy: userId,
        })
        .returning({ id: materials.id });
      if (input.sectionIds.length) {
        await tx.insert(materialSections).values([...new Set(input.sectionIds)].map((sectionId) => ({ instituteId, materialId: row!.id, sectionId })));
      }
      // MAT-04: families hear about new material in a daily batch; staff-only material is silent.
      if (input.audience !== 'staff') await this.notifications.emit(tx, 'material.added', { materialId: row!.id });
      await this.audit.record(tx, { action: 'material.create', entity: 'material', entityId: row!.id, after: input });
      return this.findDecorated(tx, row!.id);
    });
  }

  update(id: string, input: UpdateMaterialInput) {
    return this.tenantDb.run(async (tx) => {
      const before = await this.findOwnOrManaged(tx, id);
      const { sectionIds, ...fields } = input;
      if (Object.keys(fields).length) await tx.update(materials).set(fields).where(eq(materials.id, id));
      if (sectionIds) {
        await this.assertSections(tx, before.classId, sectionIds);
        await tx.delete(materialSections).where(eq(materialSections.materialId, id));
        if (sectionIds.length) {
          await tx.insert(materialSections).values([...new Set(sectionIds)].map((sectionId) => ({ instituteId: currentTenant().instituteId, materialId: id, sectionId })));
        }
      }
      const after = await this.findDecorated(tx, id);
      await this.audit.record(tx, { action: 'material.update', entity: 'material', entityId: id, before, after });
      return after;
    });
  }

  remove(id: string) {
    return this.tenantDb.run(async (tx) => {
      const before = await this.findOwnOrManaged(tx, id);
      await tx.delete(materials).where(eq(materials.id, id));
      await this.audit.record(tx, { action: 'material.delete', entity: 'material', entityId: id, before });
    });
  }

  /** What a child's family may see: their class, not staff-only, and not limited to other sections. */
  async forChild(tx: Tx, classId: string | null, sectionId: string | null, subjectId?: string) {
    if (!classId || !sectionId) return [];
    const rows = await this.base(tx)
      .where(
        and(
          eq(materials.classId, classId),
          ne(materials.audience, 'staff'),
          subjectId ? eq(materials.subjectId, subjectId) : undefined,
          or(
            notExists(tx.select({ s: materialSections.sectionId }).from(materialSections).where(eq(materialSections.materialId, materials.id))),
            exists(
              tx
                .select({ s: materialSections.sectionId })
                .from(materialSections)
                .where(and(eq(materialSections.materialId, materials.id), eq(materialSections.sectionId, sectionId))),
            ),
          ),
        ),
      )
      .orderBy(asc(subjects.name), asc(materials.chapter), asc(materials.title));
    return (await this.decorate(tx, rows)).map(({ sectionIds: _, createdBy: __, ...m }) => m);
  }

  private base(tx: Tx) {
    return tx
      .select(columns)
      .from(materials)
      .innerJoin(classes, eq(classes.id, materials.classId))
      .innerJoin(subjects, eq(subjects.id, materials.subjectId))
      .innerJoin(users, eq(users.id, materials.createdBy))
      .$dynamic();
  }

  private async decorate<T extends { id: string; fileId: string | null }>(tx: Tx, rows: T[]) {
    const out = [];
    for (const r of rows) {
      const sectionIds = (await tx.select({ id: materialSections.sectionId }).from(materialSections).where(eq(materialSections.materialId, r.id))).map((s) => s.id);
      const [file] = r.fileId ? await this.files.links(tx, [r.fileId]) : [];
      out.push({ ...r, sectionIds, file: file ?? null });
    }
    return out;
  }

  private async findDecorated(tx: Tx, id: string) {
    const rows = await this.base(tx).where(eq(materials.id, id));
    if (!rows.length) throw new AppError('not_found', 'Material not found');
    return (await this.decorate(tx, rows))[0]!;
  }

  /** Office staff (academics.manage) manage any material; teachers only their own. */
  private async findOwnOrManaged(tx: Tx, id: string) {
    const material = await this.findDecorated(tx, id);
    if (!currentContext().permissions.has('academics.manage') && material.createdBy !== currentTenant().userId) {
      throw new AppError('forbidden', 'Only the person who shared this material can change it');
    }
    return material;
  }

  private async assertMayManage(tx: Tx, classId: string, subjectId: string) {
    const [studied] = await tx
      .select({ id: classSubjects.id })
      .from(classSubjects)
      .where(and(eq(classSubjects.classId, classId), eq(classSubjects.subjectId, subjectId)));
    if (!studied) throw new AppError('invalid', 'This subject is not in the class’s subject list');
    if (currentContext().permissions.has('academics.manage')) return;
    if (!(await this.scope.teachesInClass(tx, classId, subjectId))) {
      throw new AppError('forbidden', 'You can share material only for classes and subjects you teach');
    }
  }

  private async assertSections(tx: Tx, classId: string, sectionIds: string[]) {
    if (!sectionIds.length) return;
    const found = await tx.select({ id: sections.id }).from(sections).where(and(inArray(sections.id, sectionIds), eq(sections.classId, classId)));
    if (found.length !== new Set(sectionIds).size) throw new AppError('invalid', 'Sections must belong to the material’s class');
  }
}

@Controller('materials')
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  @Get()
  @RequirePermissions('materials.view')
  list(@Query(new ZodPipe(listMaterialsQuerySchema)) q: ListMaterialsQuery) {
    return this.materials.list(q);
  }

  @Post()
  @RequirePermissions('materials.manage')
  create(@Body(new ZodPipe(createMaterialSchema)) body: CreateMaterialInput) {
    return this.materials.create(body);
  }

  @Patch(':id')
  @RequirePermissions('materials.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateMaterialSchema)) body: UpdateMaterialInput) {
    return this.materials.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('materials.manage')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.materials.remove(id);
  }
}

@Controller('family/children/:studentId/materials')
export class FamilyMaterialsController {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly family: FamilyService,
    private readonly materials: MaterialsService,
  ) {}

  @Get()
  @RequireInstitute()
  list(@Param('studentId', ParseUUIDPipe) studentId: string, @Query(new ZodPipe(familyMaterialsQuerySchema)) q: z.infer<typeof familyMaterialsQuerySchema>) {
    return this.tenantDb.run(async (tx) => {
      const child = await this.family.child(tx, studentId);
      return this.materials.forChild(tx, child.classId, child.sectionId, q.subjectId);
    });
  }
}

@Module({
  imports: [AcademicsModule],
  controllers: [MaterialsController, FamilyMaterialsController],
  providers: [MaterialsService],
})
export class MaterialsModule {}
