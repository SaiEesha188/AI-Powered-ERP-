import { type CreateAcademicYearInput, createAcademicYearSchema, type CreateTermInput, createTermSchema, updateAcademicYearSchema } from '@erp/shared';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AcademicYearsService } from './academic-years.service.js';

@Controller('academic-years')
export class AcademicYearsController {
  constructor(private readonly years: AcademicYearsService) {}

  @Get()
  @RequirePermissions('calendar.view')
  list() {
    return this.years.list();
  }

  @Post()
  @RequirePermissions('calendar.manage')
  create(@Body(new ZodPipe(createAcademicYearSchema)) body: CreateAcademicYearInput) {
    return this.years.create(body);
  }

  @Patch(':id')
  @RequirePermissions('calendar.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateAcademicYearSchema)) body: CreateAcademicYearInput) {
    return this.years.update(id, body);
  }

  @Post(':id/make-current')
  @RequirePermissions('calendar.manage')
  @HttpCode(200)
  makeCurrent(@Param('id', ParseUUIDPipe) id: string) {
    return this.years.makeCurrent(id);
  }

  @Post(':id/terms')
  @RequirePermissions('calendar.manage')
  addTerm(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(createTermSchema)) body: CreateTermInput) {
    return this.years.addTerm(id, body);
  }
}
