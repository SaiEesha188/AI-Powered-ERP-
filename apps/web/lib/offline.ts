'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { apiRaw } from './api';

/**
 * Attendance taken without signal is kept on the phone and sent when the connection returns
 * (ATT-03). capturedAt is when the teacher actually took it, so the API still treats it as
 * same-day even if it syncs the next morning.
 */
export interface PendingAttendance {
  sectionId: string;
  sectionLabel: string;
  date: string;
  records: { studentId: string; status: string }[];
  capturedAt: string;
}

const KEY = 'erp.attendance.queue';
const listeners = new Set<() => void>();
let cache: PendingAttendance[] | undefined;
const EMPTY: PendingAttendance[] = [];

function read(): PendingAttendance[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '[]') as PendingAttendance[];
  } catch {
    cache = [];
  }
  return cache;
}

function write(list: PendingAttendance[]) {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the in-memory queue still syncs while the tab is open.
  }
  listeners.forEach((l) => l());
}

/** Replaces any earlier unsent capture for the same section and day. */
export function enqueue(item: PendingAttendance) {
  write([...read().filter((p) => !(p.sectionId === item.sectionId && p.date === item.date)), item]);
}

let flushing: Promise<{ sent: number; rejected: string[] }> | null = null;

/** Sends queued captures. Network failures stay queued; refusals (e.g. a holiday) are dropped and reported. */
export function flush() {
  flushing ??= (async () => {
    let sent = 0;
    const rejected: string[] = [];
    for (const item of [...read()]) {
      let res: Response;
      try {
        res = await apiRaw(`/attendance/sections/${item.sectionId}`, {
          method: 'PUT',
          body: { date: item.date, records: item.records, capturedAt: item.capturedAt },
        });
      } catch {
        break; // still offline
      }
      if (res.status >= 500) break;
      write(read().filter((p) => p !== item && !(p.sectionId === item.sectionId && p.date === item.date)));
      if (res.ok) sent += 1;
      else rejected.push(`${item.sectionLabel}: ${((await res.json().catch(() => ({}))) as { message?: string }).message ?? 'refused'}`);
    }
    return { sent, rejected };
  })().finally(() => (flushing = null));
  return flushing;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePendingAttendance() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function useOnline() {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener('online', l);
      window.addEventListener('offline', l);
      return () => {
        window.removeEventListener('online', l);
        window.removeEventListener('offline', l);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** Flushes on load and whenever the phone comes back online. */
export function useAutoSync(onResult: (r: { sent: number; rejected: string[] }) => void) {
  const online = useOnline();
  useEffect(() => {
    if (online && read().length) flush().then((r) => (r.sent || r.rejected.length) && onResult(r));
    // Re-run only when connectivity changes; onResult may be a new function every render.
  }, [online]);
}
