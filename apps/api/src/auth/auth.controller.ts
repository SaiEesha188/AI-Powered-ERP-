import { asc, type Db, eq, institutes, roles, userRoles, users } from '@erp/db';
import { otpRequestSchema, otpVerifySchema, passwordLoginSchema, refreshSchema } from '@erp/shared';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';
import { Public } from '../common/decorators.js';
import { currentContext, currentUserId } from '../common/request-context.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { SYSTEM_DB } from '../core/core.module.js';
import { CONFIG, type Config } from '../config.js';
import { AuthService, type ClientInfo } from './auth.service.js';

const client = (req: Request): ClientInfo => ({ ip: req.ip, userAgent: req.get('user-agent') });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Public()
  @Post('otp/request')
  @HttpCode(202)
  async requestOtp(@Body(new ZodPipe(otpRequestSchema)) body: z.infer<typeof otpRequestSchema>) {
    const code = await this.auth.requestOtp(body.phone);
    // Development only: with the console SMS sender there is no real SMS, so hand the code back
    // (null = the number is not registered). Config refuses SMS_PROVIDER=console in production.
    const devCode = this.config.SMS_PROVIDER === 'console' && this.config.NODE_ENV !== 'production' ? (code ?? null) : undefined;
    return { message: 'If this number is registered, a code has been sent.', devCode };
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body(new ZodPipe(otpVerifySchema)) body: z.infer<typeof otpVerifySchema>, @Req() req: Request) {
    return this.auth.verifyOtp(body.phone, body.code, client(req));
  }

  @Public()
  @Post('password/login')
  @HttpCode(200)
  passwordLogin(@Body(new ZodPipe(passwordLoginSchema)) body: z.infer<typeof passwordLoginSchema>, @Req() req: Request) {
    return this.auth.passwordLogin(body.identifier, body.password, client(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodPipe(refreshSchema)) body: z.infer<typeof refreshSchema>) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout() {
    const ctx = currentContext();
    await this.auth.revokeSession(currentUserId(), ctx.sessionId!);
  }

  @Get('sessions')
  sessions() {
    return this.auth.listSessions(currentUserId(), currentContext().sessionId!);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revoke(@Param('id', ParseUUIDPipe) id: string) {
    await this.auth.revokeSession(currentUserId(), id);
  }
}

@Controller('me')
export class MeController {
  constructor(@Inject(SYSTEM_DB) private readonly db: Db) {}

  /** Who am I, and which institutes and roles can I switch between (USR-01). */
  @Get()
  async me() {
    const ctx = currentContext();
    const userId = currentUserId();
    const [user] = await this.db
      .select({ id: users.id, name: users.name, phone: users.phone, email: users.email, isPlatformAdmin: users.isPlatformAdmin })
      .from(users)
      .where(eq(users.id, userId));
    const rows = await this.db
      .select({
        instituteId: institutes.id,
        instituteName: institutes.name,
        subdomain: institutes.subdomain,
        vertical: institutes.vertical,
        roleCode: roles.code,
        roleName: roles.name,
      })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .innerJoin(institutes, eq(institutes.id, userRoles.instituteId))
      .where(eq(userRoles.userId, userId))
      .orderBy(asc(institutes.name), asc(roles.name));

    const memberships = new Map<string, { instituteId: string; name: string; subdomain: string; vertical: string; roles: { code: string; name: string }[] }>();
    for (const r of rows) {
      const m = memberships.get(r.instituteId) ?? {
        instituteId: r.instituteId,
        name: r.instituteName,
        subdomain: r.subdomain,
        vertical: r.vertical,
        roles: [],
      };
      m.roles.push({ code: r.roleCode, name: r.roleName });
      memberships.set(r.instituteId, m);
    }
    return {
      user,
      memberships: [...memberships.values()],
      // Present when the request named an institute; lets clients hide actions the user cannot take.
      permissions: ctx.instituteId ? [...ctx.permissions].sort() : undefined,
    };
  }
}
