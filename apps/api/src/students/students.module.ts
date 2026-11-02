import { Module } from '@nestjs/common';
import { StudentImportService } from './student-import.js';
import { SectionRollController, StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({ controllers: [StudentsController, SectionRollController], providers: [StudentsService, StudentImportService] })
export class StudentsModule {}
