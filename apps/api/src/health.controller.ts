import { type Db, sql } from '@erp/db';
import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from './common/decorators.js';
import { SYSTEM_DB } from './core/core.module.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(SYSTEM_DB) private readonly db: Db) {}

  @Public()
  @Get()
  async check() {
    await this.db.execute(sql`select 1`);
    return { status: 'ok' };
  }
}
