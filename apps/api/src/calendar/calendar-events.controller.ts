import {
  type CreateCalendarEventInput,
  createCalendarEventSchema,
  dayStatusQuerySchema,
  decideEventSchema,
  type ListCalendarQuery,
  listCalendarQuerySchema,
} from '@erp/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import { RequireInstitute, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { TenantDb } from '../core/core.module.js';
import { FamilyService } from '../family/family.service.js';
import { CalendarEventsService } from './calendar-events.service.js';

@Controller('calendar/events')
export class CalendarEventsController {
  constructor(private readonly events: CalendarEventsService) {}

  @Get()
  @RequirePermissions('calendar.view')
  list(@Query(new ZodPipe(listCalendarQuerySchema)) query: ListCalendarQuery) {
    return this.events.list(query);
  }

  /** Whether a class meets on a date: weekly offs and approved holidays (BR-01). */
  @Get('day-status')
  @RequirePermissions('calendar.view')
  dayStatus(@Query(new ZodPipe(dayStatusQuerySchema)) query: z.infer<typeof dayStatusQuerySchema>) {
    return this.events.dayStatusFor(query.date, query.classId);
  }

  @Post()
  @RequirePermissions('calendar.manage')
  create(@Body(new ZodPipe(createCalendarEventSchema)) body: CreateCalendarEventInput) {
    return this.events.create(body);
  }

  @Post(':id/decision')
  @RequirePermissions('calendar.approve')
  @HttpCode(200)
  decide(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(decideEventSchema)) body: z.infer<typeof decideEventSchema>) {
    return this.events.decide(id, body.decision);
  }

  @Delete(':id')
  @RequirePermissions('calendar.manage')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.events.remove(id);
  }
}

/** Approved holidays and events that apply to the caller's children. */
@Controller('family/calendar')
export class FamilyCalendarController {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly family: FamilyService,
    private readonly events: CalendarEventsService,
  ) {}

  @Get()
  @RequireInstitute()
  list(@Query(new ZodPipe(listCalendarQuerySchema)) query: ListCalendarQuery) {
    return this.tenantDb.run(async (tx) => {
      const children = await this.family.children(tx);
      const classIds = children.flatMap((c) => (c.classId ? [c.classId] : []));
      return this.events.listIn(tx, query, { approvedOnly: true, classIds });
    });
  }
}
