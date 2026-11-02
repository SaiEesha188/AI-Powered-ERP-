import {
  type AdmitStudentInput,
  admitStudentSchema,
  type EnrollInput,
  enrollSchema,
  type GuardianInput,
  guardianInputSchema,
  type ListStudentsQuery,
  listStudentsQuerySchema,
  type UpdateGuardianLinkInput,
  updateGuardianLinkSchema,
  type UpdateStudentInput,
  updateStudentSchema,
} from '@erp/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { StudentImportService } from './student-import.js';
import { StudentsService } from './students.service.js';

@Controller('students')
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly importer: StudentImportService,
  ) {}

  @Get()
  @RequirePermissions('students.view')
  list(@Query(new ZodPipe(listStudentsQuerySchema)) query: ListStudentsQuery) {
    return this.students.list(query);
  }

  @Post()
  @RequirePermissions('students.manage')
  admit(@Body(new ZodPipe(admitStudentSchema)) body: AdmitStudentInput) {
    return this.students.admit(body);
  }

  /** CFG-07. Multipart field "file" (.csv or .xlsx). ?dryRun=true validates without saving. */
  @Post('import')
  @RequirePermissions('students.manage')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async import(@UploadedFile() file: { buffer: Buffer; originalname: string } | undefined, @Query('dryRun') dryRun?: string) {
    if (!file) throw new BadRequestException('Attach the spreadsheet as multipart field "file"');
    const report = await this.importer.import(file, dryRun === 'true');
    if (!report.dryRun && report.errors.length) throw new UnprocessableEntityException(report);
    return report;
  }

  @Get(':id')
  @RequirePermissions('students.view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.students.get(id);
  }

  @Patch(':id')
  @RequirePermissions('students.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateStudentSchema)) body: UpdateStudentInput) {
    return this.students.update(id, body);
  }

  @Post(':id/guardians')
  @RequirePermissions('students.manage')
  addGuardian(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(guardianInputSchema)) body: GuardianInput) {
    return this.students.addGuardian(id, body);
  }

  @Patch(':id/guardians/:guardianId')
  @RequirePermissions('students.manage')
  updateGuardian(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('guardianId', ParseUUIDPipe) guardianId: string,
    @Body(new ZodPipe(updateGuardianLinkSchema)) body: UpdateGuardianLinkInput,
  ) {
    return this.students.updateGuardian(id, guardianId, body);
  }

  @Delete(':id/guardians/:guardianId')
  @RequirePermissions('students.manage')
  @HttpCode(204)
  async removeGuardian(@Param('id', ParseUUIDPipe) id: string, @Param('guardianId', ParseUUIDPipe) guardianId: string) {
    await this.students.removeGuardian(id, guardianId);
  }

  @Put(':id/enrollment')
  @RequirePermissions('students.manage')
  enroll(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(enrollSchema)) body: EnrollInput) {
    return this.students.enroll(id, body);
  }
}

@Controller('sections')
export class SectionRollController {
  constructor(private readonly students: StudentsService) {}

  @Post(':id/roll-numbers/auto')
  @RequirePermissions('students.manage')
  @HttpCode(200)
  autoRoll(@Param('id', ParseUUIDPipe) id: string) {
    return this.students.autoRollNumbers(id);
  }
}
