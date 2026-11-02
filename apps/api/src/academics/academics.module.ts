import { Module } from '@nestjs/common';
import { ClassesController, MyTeachingController, SectionsController, SubjectsController } from './academics.controller.js';
import { ClassesService } from './classes.service.js';
import { SectionsService } from './sections.service.js';
import { TeachingScope } from './teaching-scope.js';

@Module({
  controllers: [ClassesController, SubjectsController, SectionsController, MyTeachingController],
  providers: [ClassesService, SectionsService, TeachingScope],
  exports: [SectionsService, TeachingScope],
})
export class AcademicsModule {}
