import { and, type Db, eq, gt, institutes, isNull, permissions, rolePermissions, sessions, userRoles, users } from '@erp/db';
import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PLATFORM_ADMIN, IS_PUBLIC, REQUIRED_PERMISSIONS } from '../common/decorators.js';
import { currentContext } from '../common/request-context.js';
import { SYSTEM_DB } from '../core/core.module.js';
import type { AccessClaims } from './auth.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Global guard. Every route is authenticated unless marked @Public. The session and user
 * status are checked on every request so a remote logout or a disabled account takes effect
 * immediately rather than when the access token expires.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(SYSTEM_DB) private readonly db: Db,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = <T>(key: string) => this.reflector.getAllAndOverride<T>(key, [context.getHandler(), context.getClass()]);
    if (meta<boolean>(IS_PUBLIC)) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Missing bearer token');

    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const [account] = await this.db
      .select({ isPlatformAdmin: users.isPlatformAdmin })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.id, claims.sid),
          eq(sessions.userId, claims.sub),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
          eq(users.status, 'active'),
        ),
      );
    if (!account) throw new UnauthorizedException('Session ended');

    const ctx = currentContext();
    ctx.userId = claims.sub;
    ctx.sessionId = claims.sid;
    ctx.isPlatformAdmin = account.isPlatformAdmin;

    if (meta<boolean>(IS_PLATFORM_ADMIN) && !account.isPlatformAdmin) throw new ForbiddenException();

    const instituteId = req.get('x-institute-id');
    if (instituteId) {
      if (!UUID.test(instituteId)) throw new BadRequestException('X-Institute-Id must be a UUID');
      ctx.permissions = await this.loadMembership(claims.sub, instituteId);
      ctx.instituteId = instituteId;
    }

    const required = meta<string[]>(REQUIRED_PERMISSIONS);
    if (required) {
      if (!ctx.instituteId) throw new BadRequestException('X-Institute-Id header is required');
      if (!required.every((p) => ctx.permissions.has(p))) throw new ForbiddenException('Missing permission');
    }
    return true;
  }

  private async loadMembership(userId: string, instituteId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ code: permissions.code })
      .from(userRoles)
      .innerJoin(institutes, eq(institutes.id, userRoles.instituteId))
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(and(eq(userRoles.userId, userId), eq(userRoles.instituteId, instituteId), eq(institutes.status, 'active')));
    // Same response whether the institute exists or not, so IDs cannot be probed.
    if (rows.length === 0) throw new ForbiddenException('Not a member of this institute');
    return new Set(rows.flatMap((r) => (r.code ? [r.code] : [])));
  }
}
