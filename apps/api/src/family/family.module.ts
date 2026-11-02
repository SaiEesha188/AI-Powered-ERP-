import { Controller, Get, Global, Module } from '@nestjs/common';
import { RequireInstitute } from '../common/decorators.js';
import { TenantDb } from '../core/core.module.js';
import { FamilyService } from './family.service.js';

/** Parent app home: the caller's children. Other modules add /family/children/:id/... routes. */
@Controller('family/children')
export class FamilyController {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly family: FamilyService,
  ) {}

  @Get()
  @RequireInstitute()
  children() {
    return this.tenantDb.run((tx) => this.family.children(tx));
  }
}

@Global()
@Module({ controllers: [FamilyController], providers: [FamilyService], exports: [FamilyService] })
export class FamilyModule {}
