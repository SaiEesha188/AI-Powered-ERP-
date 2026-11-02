import { type CreateStaffInput, createStaffSchema, type UpdateStaffInput, updateStaffSchema } from '@erp/shared';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { StaffService } from './staff.service.js';

@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermissions('staff.view')
  list() {
    return this.staff.list();
  }

  @Post()
  @RequirePermissions('staff.manage', 'users.manage')
  create(@Body(new ZodPipe(createStaffSchema)) body: CreateStaffInput) {
    return this.staff.create(body);
  }

  @Patch(':id')
  @RequirePermissions('staff.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateStaffSchema)) body: UpdateStaffInput) {
    return this.staff.update(id, body);
  }
}
