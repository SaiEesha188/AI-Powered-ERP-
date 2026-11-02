// Per-request state carried through async calls, so services can reach the caller's identity
// and tenant without threading them through every method.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  ip?: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  isPlatformAdmin?: boolean;
  /** Set only when the request carries X-Institute-Id and the user is a member there. */
  instituteId?: string;
  permissions: ReadonlySet<string>;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const store: RequestContext = { ip: req.ip, userAgent: req.get('user-agent'), permissions: new Set() };
  storage.run(store, next);
}

export function currentContext(): RequestContext {
  const store = storage.getStore();
  if (!store) throw new Error('No request context: requestContextMiddleware is not installed');
  return store;
}

/** Context for code that also runs outside requests (e.g. audit writes from jobs). */
export function optionalContext(): RequestContext | undefined {
  return storage.getStore();
}

export function currentUserId(): string {
  const { userId } = currentContext();
  if (!userId) throw new Error('No authenticated user in request context');
  return userId;
}

export function currentTenant(): { instituteId: string; userId: string } {
  const { instituteId, userId } = currentContext();
  if (!instituteId || !userId) throw new Error('No tenant in request context; protect the route with @RequirePermissions');
  return { instituteId, userId };
}
