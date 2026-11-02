import {
  type CreateHomeworkInput,
  createHomeworkSchema,
  dateRangeQuerySchema,
  type HomeworkCompletionInput,
  homeworkCompletionSchema,
  type ListHomeworkQuery,
  listHomeworkQuerySchema,
  type UpdateHomeworkInput,
  updateHomeworkSchema,
} from '@erp/shared';
import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import { AcademicsModule } from '../academics/academics.module.js';
import { CalendarModule } from '../calendar/calendar.module.js';
import { RequireInstitute, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { TenantDb } from '../core/core.module.js';
import { FamilyService } from '../family/family.service.js';
import { HomeworkService } from './homework.service.js';

@Controller('homework')
export class HomeworkController {
  constructor(private readonly homework: HomeworkService) {}

  @Get()
  @RequirePermissions('homework.view')
  list(@Query(new ZodPipe(listHomeworkQuerySchema)) q: ListHomeworkQuery) {
    return this.homework.list(q);
  }

  @Post()
  @RequirePermissions('homework.manage')
  create(@Body(new ZodPipe(createHomeworkSchema)) body: CreateHomeworkInput) {
    return this.homework.create(body);
  }

  @Get(':id')
  @RequirePermissions('homework.view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.homework.get(id);
  }

  @Patch(':id')
  @RequirePermissions('homework.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateHomeworkSchema)) body: UpdateHomeworkInput) {
    return this.homework.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('homework.manage')
  @HttpCode(204)
  async cancel(@Param('id', ParseUUIDPipe) id: string) {
    await this.homework.cancel(id);
  }

  @Put(':id/completion')
  @RequirePermissions('homework.manage')
  complete(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(homeworkCompletionSchema)) body: HomeworkCompletionInput) {
    return this.homework.complete(id, body);
  }
}

@Controller('family/children/:studentId/homework')
export class FamilyHomeworkController {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly family: FamilyService,
    private readonly homework: HomeworkService,
  ) {}

  @Get()
  @RequireInstitute()
  list(@Param('studentId', ParseUUIDPipe) studentId: string, @Query(new ZodPipe(dateRangeQuerySchema)) q: z.infer<typeof dateRangeQuerySchema>) {
    return this.tenantDb.run(async (tx) => {
      const child = await this.family.child(tx, studentId);
      return this.homework.forChild(tx, studentId, child.sectionId, q.from, q.to);
    });
  }
}

@Module({
  imports: [AcademicsModule, CalendarModule],
  controllers: [HomeworkController, FamilyHomeworkController],
  providers: [HomeworkService],
})
export class HomeworkModule {}
