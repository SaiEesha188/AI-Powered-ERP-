import { and, count, type Db, desc, eq, gt, isNull, otpCodes, or, sessions, type Tx, users } from '@erp/db';
import { AppError } from '@erp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditService, SYSTEM_DB } from '../core/core.module.js';
import { CONFIG, type Config } from '../config.js';
import {
  DUMMY_PASSWORD_HASH,
  hashOtp,
  randomOtp,
  randomToken,
  safeEqual,
  sha256,
  verifyPassword,
} from './crypto.js';
import { SmsSender } from './sms.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AccessClaims {
  sub: string;
  sid: string;
}

const invalidCode = () => new AppError('unauthorized', 'Invalid or expired code');
const invalidLogin = () => new AppError('unauthorized', 'Invalid credentials');
const invalidSession = () => new AppError('unauthorized', 'Session expired; sign in again');

@Injectable()
export class AuthService {
  constructor(
    @Inject(SYSTEM_DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: Config,
    private readonly jwt: JwtService,
    private readonly sms: SmsSender,
    private readonly audit: AuditService,
  ) {}

  /**
   * Sends a code only to registered, active users. The response is the same either way so the
   * endpoint cannot be used to discover which numbers have accounts.
   */
  async requestOtp(phone: string): Promise<string | undefined> {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const [recent] = await this.db
      .select({ n: count() })
      .from(otpCodes)
      .where(and(eq(otpCodes.phone, phone), gt(otpCodes.createdAt, since)));
    if ((recent?.n ?? 0) >= this.config.OTP_MAX_PER_HOUR) throw new AppError('rate_limited', 'Too many codes requested; try again later');

    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phone, phone), eq(users.status, 'active')));
    if (!user) return undefined;

    const code = randomOtp();
    await this.db.insert(otpCodes).values({
      phone,
      codeHash: hashOtp(this.config.JWT_SECRET, phone, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    await this.sms.sendOtp(phone, code);
    return code;
  }

  async verifyOtp(phone: string, code: string, client: ClientInfo): Promise<TokenPair> {
    const userId = await this.db.transaction(async (tx) => {
      const [otp] = await tx
        .select()
        .from(otpCodes)
        .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date())))
        .orderBy(desc(otpCodes.createdAt))
        .limit(1)
        .for('update');
      if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) return null;
      if (!safeEqual(otp.codeHash, hashOtp(this.config.JWT_SECRET, phone, code))) {
        await tx.update(otpCodes).set({ attempts: otp.attempts + 1 }).where(eq(otpCodes.id, otp.id));
        return null;
      }
      await tx.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, otp.id));
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.phone, phone), eq(users.status, 'active')));
      return user?.id ?? null;
    });
    // Failed attempts must be committed, so the error is thrown after the transaction.
    if (!userId) throw invalidCode();
    return this.db.transaction((tx) => this.startSession(tx, userId, 'otp', client));
  }

  async passwordLogin(identifier: string, password: string, client: ClientInfo): Promise<TokenPair> {
    const id = identifier.trim();
    const [user] = await this.db
      .select({ id: users.id, passwordHash: users.passwordHash, status: users.status })
      .from(users)
      .where(or(eq(users.email, id.toLowerCase()), eq(users.username, id)));
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !ok || user.status !== 'active') throw invalidLogin();
    return this.db.transaction((tx) => this.startSession(tx, user.id, 'password', client));
  }

  /** Rotates the refresh token. Presenting an already-rotated token revokes the session (theft signal). */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const [sessionId, secret] = refreshToken.split('.');
    if (!sessionId || !secret || !/^[0-9a-f-]{36}$/.test(sessionId)) throw invalidSession();

    const result = await this.db.transaction(async (tx) => {
      const [session] = await tx
        .select({ id: sessions.id, userId: sessions.userId, hash: sessions.refreshTokenHash, status: users.status })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
        .for('update', { of: sessions });
      if (!session || session.status !== 'active') return { error: invalidSession() };
      if (!safeEqual(session.hash, sha256(secret))) {
        await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));
        return { error: invalidSession() };
      }
      const next = randomToken();
      await tx
        .update(sessions)
        .set({ refreshTokenHash: sha256(next), lastUsedAt: new Date() })
        .where(eq(sessions.id, session.id));
      return { tokens: await this.issueTokens(session.userId, session.id, next) };
    });
    if (result.error) throw result.error;
    return result.tokens!;
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const revoked = await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (revoked.length === 0) throw new AppError('not_found', 'Session not found');
  }

  async listSessions(userId: string, currentSessionId: string) {
    const rows = await this.db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        ip: sessions.ip,
        createdAt: sessions.createdAt,
        lastUsedAt: sessions.lastUsedAt,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastUsedAt));
    return rows.map((s) => ({ ...s, current: s.id === currentSessionId }));
  }

  private async startSession(tx: Tx, userId: string, method: 'otp' | 'password', client: ClientInfo) {
    const secret = randomToken();
    const [session] = await tx
      .insert(sessions)
      .values({
        userId,
        refreshTokenHash: sha256(secret),
        userAgent: client.userAgent?.slice(0, 500),
        ip: client.ip,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      })
      .returning({ id: sessions.id });
    if (!session) throw new Error('session insert returned nothing');
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
    await this.audit.record(tx, {
      action: 'auth.login',
      entity: 'user',
      entityId: userId,
      after: { method, sessionId: session.id },
      instituteId: null,
      actorId: userId,
    });
    return this.issueTokens(userId, session.id, secret);
  }

  private async issueTokens(userId: string, sessionId: string, secret: string): Promise<TokenPair> {
    const claims: AccessClaims = { sub: userId, sid: sessionId };
    return {
      accessToken: await this.jwt.signAsync(claims),
      refreshToken: `${sessionId}.${secret}`,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }
}
