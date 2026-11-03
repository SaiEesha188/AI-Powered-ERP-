'use client';

import { useSyncExternalStore } from 'react';

/**
 * Sign-in state kept in localStorage so the PWA survives reloads and offline restarts.
 * The access token lives 15 minutes; the refresh token rotates on every use (see API auth).
 */
export interface Session {
  accessToken: string;
  refreshToken: string;
  instituteId?: string;
  experience?: Experience;
}

export type Experience = 'admin' | 'teacher' | 'parent' | 'platform';

const KEY = 'erp.session';
const listeners = new Set<() => void>();
let current: Session | null | undefined;

function read(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  if (current === undefined) current = read();
  return current;
}

export function setSession(next: Session | null) {
  current = next;
  try {
    if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private mode or storage disabled: keep the session in memory only.
  }
  listeners.forEach((l) => l());
}

export function updateSession(patch: Partial<Session>) {
  const s = getSession();
  if (s) setSession({ ...s, ...patch });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** undefined while hydrating on the client, so pages can wait instead of redirecting too early. */
export function useSession(): Session | null | undefined {
  return useSyncExternalStore(subscribe, getSession, () => undefined);
}
