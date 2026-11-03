import {
  attendanceDateQuerySchema,
  dateRangeQuerySchema,
  type DefaultersQuery,
  defaultersQuerySchema,
  type MarkAttendanceInput,
  markAttendanceSchema,
  monthQuerySchema,
} from '@erp/shared';
import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import { RequireInstitute, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { TenantDb } from '../core/core.module.js';
import { FamilyService } from '../family/family.service.js';
import { AttendanceService } from './attendance.service.js';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('sections/:sectionId')
  @RequirePermissions('attendance.view')
  roster(@Param('sectionId', ParseUUIDPipe) sectionId: string, @Query(new ZodPipe(attendanceDateQuerySchema)) q: z.infer<typeof attendanceDateQuerySchema>) {
    return this.attendance.roster(sectionId, q.date);
  }

  /** Idempotent: re-sending the same day replaces it, which is what offline sync relies on. */
  @Put('sections/:sectionId')
  @RequirePermissions('attendance.mark')
  mark(@Param('sectionId', ParseUUIDPipe) sectionId: string, @Body(new ZodPipe(markAttendanceSchema)) body: MarkAttendanceInput) {
    return this.attendance.mark(sectionId, body);
  }

  @Get('reports/daily')
  @RequirePermissions('attendance.view')
  daily(@Query(new ZodPipe(attendanceDateQuerySchema)) q: z.infer<typeof attendanceDateQuerySchema>) {
    return this.attendance.dailySummary(q.date);
  }

  @Get('reports/trend')
  @RequirePermissions('attendance.view')
  trend(@Query(new ZodPipe(dateRangeQuerySchema)) q: z.infer<typeof dateRangeQuerySchema>) {
    return this.attendance.trend(q.from, q.to);
  }

  @Get('reports/register/:sectionId')
  @RequirePermissions('attendance.view')
  register(@Param('sectionId', ParseUUIDPipe) sectionId: string, @Query(new ZodPipe(monthQuerySchema)) q: z.infer<typeof monthQuerySchema>) {
    return this.attendance.register(sectionId, q.month);
  }

  @Get('reports/defaulters')
  @RequirePermissions('attendance.view')
  defaulters(@Query(new ZodPipe(defaultersQuerySchema)) q: DefaultersQuery) {
    return this.attendance.defaulters(q);
  }
}

@Controller('family/children/:studentId/attendance')
export class FamilyAttendanceController {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly family: FamilyService,
    private readonly attendance: AttendanceService,
  ) {}

  @Get()
  @RequireInstitute()
  month(@Param('studentId', ParseUUIDPipe) studentId: string, @Query(new ZodPipe(monthQuerySchema)) q: z.infer<typeof monthQuerySchema>) {
    return this.tenantDb.run(async (tx) => {
      await this.family.child(tx, studentId);
      return this.attendance.childMonth(tx, studentId, q.month);
    });
  }
}
