import { type AddUserInput, addUserSchema, roleCodeSchema } from '@erp/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users.view')
  list() {
    return this.users.list();
  }

  @Post()
  @RequirePermissions('users.manage')
  add(@Body(new ZodPipe(addUserSchema)) body: AddUserInput) {
    return this.users.add(body);
  }

  @Delete(':userId/roles/:role')
  @RequirePermissions('users.manage')
  @HttpCode(204)
  async removeRole(@Param('userId', ParseUUIDPipe) userId: string, @Param('role', new ZodPipe(roleCodeSchema)) role: string) {
    await this.users.removeRole(userId, role);
  }
}
