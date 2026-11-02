import { Module } from '@nestjs/common';
import { AcademicYearsController } from './academic-years.controller.js';
import { AcademicYearsService } from './academic-years.service.js';
import { CalendarEventsController, FamilyCalendarController } from './calendar-events.controller.js';
import { CalendarEventsService } from './calendar-events.service.js';

@Module({
  controllers: [AcademicYearsController, CalendarEventsController, FamilyCalendarController],
  providers: [AcademicYearsService, CalendarEventsService],
  exports: [CalendarEventsService],
})
export class CalendarModule {}
