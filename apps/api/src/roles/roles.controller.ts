import { type CreateRoleInput, createRoleSchema, PERMISSIONS, setRolePermissionsSchema } from '@erp/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import type { z } from 'zod';
import { RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { RolesService } from './roles.service.js';

@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('permissions')
  @RequirePermissions('roles.view')
  catalogue() {
    return PERMISSIONS;
  }

  @Get('roles')
  @RequirePermissions('roles.view')
  list() {
    return this.roles.list();
  }

  @Post('roles')
  @RequirePermissions('roles.manage')
  create(@Body(new ZodPipe(createRoleSchema)) body: CreateRoleInput) {
    return this.roles.create(body);
  }

  @Put('roles/:id/permissions')
  @RequirePermissions('roles.manage')
  setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(setRolePermissionsSchema)) body: z.infer<typeof setRolePermissionsSchema>,
  ) {
    return this.roles.setPermissions(id, body.permissions);
  }

  @Delete('roles/:id')
  @RequirePermissions('roles.manage')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.roles.remove(id);
  }
}
