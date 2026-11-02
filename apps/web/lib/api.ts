'use client';

import { getSession, setSession } from './session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  /** Skip the X-Institute-Id header (auth and /me without context). */
  noInstitute?: boolean;
}

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const session = getSession();
  if (!session) return false;
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  if (!res.ok) return false;
  const tokens = (await res.json()) as { accessToken: string; refreshToken: string };
  setSession({ ...session, ...tokens });
  return true;
}

function messageFrom(body: unknown, fallback: string) {
  if (body && typeof body === 'object') {
    const b = body as { message?: unknown; issues?: { path: string; message: string }[] };
    if (b.issues?.length) return b.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join(' · ');
    if (typeof b.message === 'string') return b.message;
  }
  return fallback;
}

async function send(path: string, opts: RequestOptions) {
  const session = getSession();
  const headers: Record<string, string> = {};
  if (session) headers.authorization = `Bearer ${session.accessToken}`;
  if (session?.instituteId && !opts.noInstitute) headers['x-institute-id'] = session.instituteId;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
}

/** Calls the API, refreshing the access token once if it has expired. */
export async function apiRaw(path: string, opts: RequestOptions = {}): Promise<Response> {
  let res = await send(path, opts);
  if (res.status === 401 && getSession() && !path.startsWith('/auth/')) {
    refreshing ??= refreshTokens().finally(() => (refreshing = null));
    if (await refreshing) res = await send(path, opts);
    else {
      setSession(null);
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') window.location.href = '/login';
    }
  }
  return res;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await apiRaw(path, opts);
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, messageFrom(body, res.statusText), body);
  return body as T;
}

/** Downloads a report export (CSV/XLSX) with the caller's credentials. */
export async function download(path: string, filename: string) {
  const res = await apiRaw(path);
  if (!res.ok) throw new ApiError(res.status, 'Download failed', null);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** File URLs from the API point at the API origin; route them through the /api proxy. */
export function fileUrl(url: string) {
  try {
    const u = new URL(url);
    return `/api${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}
