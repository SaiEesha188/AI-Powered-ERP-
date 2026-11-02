import {
  type CreateAssignmentInput,
  createAssignmentSchema,
  type CreateClassInput,
  createClassSchema,
  type CreateSectionInput,
  createSectionSchema,
  type CreateSubjectInput,
  createSubjectSchema,
  type ListSectionsQuery,
  listSectionsQuerySchema,
  type SetClassSubjectsInput,
  setClassSubjectsSchema,
  type UpdateClassInput,
  updateClassSchema,
  type UpdateSectionInput,
  updateSectionSchema,
  type UpdateSubjectInput,
  updateSubjectSchema,
} from '@erp/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ClassesService } from './classes.service.js';
import { SectionsService } from './sections.service.js';

@Controller('classes')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  @RequirePermissions('academics.view')
  list() {
    return this.classes.listClasses();
  }

  @Post()
  @RequirePermissions('academics.manage')
  create(@Body(new ZodPipe(createClassSchema)) body: CreateClassInput) {
    return this.classes.createClass(body);
  }

  @Patch(':id')
  @RequirePermissions('academics.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateClassSchema)) body: UpdateClassInput) {
    return this.classes.updateClass(id, body);
  }

  @Delete(':id')
  @RequirePermissions('academics.manage')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.classes.deleteClass(id);
  }

  @Put(':id/subjects')
  @RequirePermissions('academics.manage')
  setSubjects(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(setClassSubjectsSchema)) body: SetClassSubjectsInput) {
    return this.classes.setClassSubjects(id, body);
  }
}

@Controller('subjects')
export class SubjectsController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  @RequirePermissions('academics.view')
  list() {
    return this.classes.listSubjects();
  }

  @Post()
  @RequirePermissions('academics.manage')
  create(@Body(new ZodPipe(createSubjectSchema)) body: CreateSubjectInput) {
    return this.classes.createSubject(body);
  }

  @Patch(':id')
  @RequirePermissions('academics.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateSubjectSchema)) body: UpdateSubjectInput) {
    return this.classes.updateSubject(id, body);
  }

  @Delete(':id')
  @RequirePermissions('academics.manage')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.classes.deleteSubject(id);
  }
}

@Controller('sections')
export class SectionsController {
  constructor(private readonly sections: SectionsService) {}

  @Get()
  @RequirePermissions('academics.view')
  list(@Query(new ZodPipe(listSectionsQuerySchema)) query: ListSectionsQuery) {
    return this.sections.list(query);
  }

  @Post()
  @RequirePermissions('academics.manage')
  create(@Body(new ZodPipe(createSectionSchema)) body: CreateSectionInput) {
    return this.sections.create(body);
  }

  @Patch(':id')
  @RequirePermissions('academics.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateSectionSchema)) body: UpdateSectionInput) {
    return this.sections.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('academics.manage')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.sections.remove(id);
  }

  @Post(':id/assignments')
  @RequirePermissions('academics.manage')
  addAssignment(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(createAssignmentSchema)) body: CreateAssignmentInput) {
    return this.sections.addAssignment(id, body);
  }

  @Delete(':id/assignments/:assignmentId')
  @RequirePermissions('academics.manage')
  @HttpCode(204)
  async removeAssignment(@Param('id', ParseUUIDPipe) id: string, @Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    await this.sections.removeAssignment(id, assignmentId);
  }
}

@Controller('me/teaching')
export class MyTeachingController {
  constructor(private readonly sections: SectionsService) {}

  @Get()
  @RequirePermissions('academics.view')
  get() {
    return this.sections.myTeaching();
  }
}
