import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';

@Module({ imports: [UsersModule], controllers: [StaffController], providers: [StaffService] })
export class StaffModule {}
