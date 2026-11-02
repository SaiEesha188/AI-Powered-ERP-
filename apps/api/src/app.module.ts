import { type INestApplication, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AcademicsModule } from './academics/academics.module.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { AuditModule } from './audit/audit.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { CalendarModule } from './calendar/calendar.module.js';
import { CircularsModule } from './circulars/circulars.module.js';
import { ErrorFilter } from './common/error.filter.js';
import { requestContextMiddleware } from './common/request-context.js';
import { CoreModule } from './core/core.module.js';
import { FamilyModule } from './family/family.module.js';
import { FilesModule } from './files/files.js';
import { HealthController } from './health.controller.js';
import { HomeworkModule } from './homework/homework.module.js';
import { InstituteModule } from './institute/institute.module.js';
import { MaterialsModule } from './materials/materials.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { RolesModule } from './roles/roles.module.js';
import { StaffModule } from './staff/staff.module.js';
import { StudentsModule } from './students/students.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [CoreModule, AuthModule, PlatformModule, InstituteModule, RolesModule, UsersModule, CalendarModule, AuditModule, StaffModule, AcademicsModule, FamilyModule, StudentsModule, AttendanceModule, NotificationsModule, FilesModule, HomeworkModule, MaterialsModule, CircularsModule, ReportsModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ErrorFilter }],
})
export class AppModule {}

/** Shared by main.ts and the tests so both run the same HTTP pipeline. */
export function configureApp(app: INestApplication) {
  app.use(requestContextMiddleware);
  app.enableShutdownHooks();
  return app;
}
