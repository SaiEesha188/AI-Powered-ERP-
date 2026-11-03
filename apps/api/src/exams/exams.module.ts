import {
  type AssessmentTypeInput,
  assessmentTypeSchema,
  type CreateExamInput,
  createExamSchema,
  type EnterMarksInput,
  enterMarksSchema,
  type GradeScaleInput,
  gradeScaleSchema,
  listExamsQuerySchema,
  marksQuerySchema,
  type UpdateExamInput,
  updateExamSchema,
  type UpdatePaperInput,
  updatePaperSchema,
  updateRemarksSchema,
} from '@erp/shared';
import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import { AcademicsModule } from '../academics/academics.module.js';
import { RequireInstitute, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { TenantDb } from '../core/core.module.js';
import { FamilyService } from '../family/family.service.js';
import { ExamsService } from './exams.service.js';
import { MarksService } from './marks.service.js';
import { ReportCardsService } from './report-cards.service.js';

@Controller('exams')
export class ExamsController {
  constructor(
    private readonly exams: ExamsService,
    private readonly marks: MarksService,
    private readonly cards: ReportCardsService,
  ) {}

  @Get('assessment-types')
  @RequirePermissions('exams.view')
  assessmentTypes() {
    return this.exams.assessmentTypes();
  }

  @Post('assessment-types')
  @RequirePermissions('exams.manage')
  createType(@Body(new ZodPipe(assessmentTypeSchema)) body: AssessmentTypeInput) {
    return this.exams.createAssessmentType(body);
  }

  @Put('assessment-types/:id')
  @RequirePermissions('exams.manage')
  updateType(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(assessmentTypeSchema)) body: AssessmentTypeInput) {
    return this.exams.updateAssessmentType(id, body);
  }

  @Delete('assessment-types/:id')
  @RequirePermissions('exams.manage')
  @HttpCode(204)
  async deleteType(@Param('id', ParseUUIDPipe) id: string) {
    await this.exams.deleteAssessmentType(id);
  }

  @Get('grade-scales')
  @RequirePermissions('exams.view')
  gradeScales() {
    return this.exams.gradeScales();
  }

  @Post('grade-scales')
  @RequirePermissions('institute.settings.manage')
  createScale(@Body(new ZodPipe(gradeScaleSchema)) body: GradeScaleInput) {
    return this.exams.saveGradeScale(null, body);
  }

  @Put('grade-scales/:id')
  @RequirePermissions('institute.settings.manage')
  updateScale(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(gradeScaleSchema)) body: GradeScaleInput) {
    return this.exams.saveGradeScale(id, body);
  }

  @Get()
  @RequirePermissions('exams.view')
  list(@Query(new ZodPipe(listExamsQuerySchema)) q: z.infer<typeof listExamsQuerySchema>) {
    return this.exams.list(q.status);
  }

  @Post()
  @RequirePermissions('exams.manage')
  create(@Body(new ZodPipe(createExamSchema)) body: CreateExamInput) {
    return this.exams.create(body);
  }

  /** The teacher app's marks to-do list. */
  @Get('my-tasks')
  @RequirePermissions('marks.enter')
  myTasks() {
    return this.marks.myTasks();
  }

  @Patch('papers/:paperId')
  @RequirePermissions('exams.manage')
  updatePaper(@Param('paperId', ParseUUIDPipe) paperId: string, @Body(new ZodPipe(updatePaperSchema)) body: UpdatePaperInput) {
    return this.exams.updatePaper(paperId, body);
  }

  @Get('papers/:paperId/marks')
  @RequirePermissions('marks.view')
  grid(@Param('paperId', ParseUUIDPipe) paperId: string, @Query(new ZodPipe(marksQuerySchema)) q: z.infer<typeof marksQuerySchema>) {
    return this.marks.grid(paperId, q.sectionId);
  }

  @Put('papers/:paperId/marks')
  @RequirePermissions('marks.view')
  enter(@Param('paperId', ParseUUIDPipe) paperId: string, @Body(new ZodPipe(enterMarksSchema)) body: EnterMarksInput) {
    return this.marks.enter(paperId, body);
  }

  @Get(':id')
  @RequirePermissions('exams.view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.exams.get(id);
  }

  @Patch(':id')
  @RequirePermissions('exams.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateExamSchema)) body: UpdateExamInput) {
    return this.exams.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('exams.manage')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.exams.remove(id);
  }

  @Post(':id/schedule')
  @RequirePermissions('exams.manage')
  @HttpCode(200)
  schedule(@Param('id', ParseUUIDPipe) id: string) {
    return this.exams.schedule(id);
  }

  /** The class teacher of the section, or the principal; checked in the service. */
  @Post(':id/sections/:sectionId/lock')
  @RequirePermissions('marks.view')
  @HttpCode(200)
  lock(@Param('id', ParseUUIDPipe) id: string, @Param('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.marks.lockSection(id, sectionId);
  }

  @Delete(':id/sections/:sectionId/lock')
  @RequirePermissions('report_cards.publish')
  @HttpCode(200)
  unlock(@Param('id', ParseUUIDPipe) id: string, @Param('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.marks.unlockSection(id, sectionId);
  }

  @Get(':id/report-cards')
  @RequirePermissions('report_cards.view')
  reportCards(@Param('id', ParseUUIDPipe) id: string) {
    return this.cards.list(id);
  }

  @Post(':id/report-cards/generate')
  @RequirePermissions('report_cards.manage')
  @HttpCode(200)
  generate(@Param('id', ParseUUIDPipe) id: string) {
    return this.cards.generate(id);
  }

  @Post(':id/report-cards/publish')
  @RequirePermissions('report_cards.publish')
  @HttpCode(200)
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.cards.publish(id);
  }

  @Get(':id/analysis')
  @RequirePermissions('report_cards.view')
  analysis(@Param('id', ParseUUIDPipe) id: string) {
    return this.cards.analysis(id);
  }
}

@Controller('report-cards')
export class ReportCardsController {
  constructor(private readonly cards: ReportCardsService) {}

  @Get(':id')
  @RequirePermissions('report_cards.view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.cards.get(id);
  }

  @Patch(':id/remarks')
  @RequirePermissions('report_cards.view')
  remarks(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateRemarksSchema)) body: z.infer<typeof updateRemarksSchema>) {
    return this.cards.setRemarks(id, body.remarks);
  }
}

/** Parents: date sheets and published report cards for their own children (BR-05). */
@Controller('family/children/:studentId')
export class FamilyResultsController {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly family: FamilyService,
    private readonly cards: ReportCardsService,
  ) {}

  @Get('exams')
  @RequireInstitute()
  exams(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.tenantDb.run(async (tx) => {
      const child = await this.family.child(tx, studentId);
      return this.cards.scheduleForChild(tx, child.classId);
    });
  }

  @Get('report-cards')
  @RequireInstitute()
  list(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.tenantDb.run(async (tx) => {
      await this.family.child(tx, studentId);
      return this.cards.forChild(tx, studentId);
    });
  }

  @Get('report-cards/:cardId')
  @RequireInstitute()
  get(@Param('studentId', ParseUUIDPipe) studentId: string, @Param('cardId', ParseUUIDPipe) cardId: string) {
    return this.tenantDb.run(async (tx) => {
      await this.family.child(tx, studentId);
      return this.cards.childCard(tx, studentId, cardId);
    });
  }
}

@Module({
  imports: [AcademicsModule],
  controllers: [ExamsController, ReportCardsController, FamilyResultsController],
  providers: [ExamsService, MarksService, ReportCardsService],
})
export class ExamsModule {}
