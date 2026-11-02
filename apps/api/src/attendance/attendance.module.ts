import { Module } from '@nestjs/common';
import { AcademicsModule } from '../academics/academics.module.js';
import { CalendarModule } from '../calendar/calendar.module.js';
import { AttendanceController, FamilyAttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';

@Module({
  imports: [AcademicsModule, CalendarModule],
  controllers: [AttendanceController, FamilyAttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
