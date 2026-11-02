import { eq, institutes, type Tx } from '@erp/db';
import { effectiveSettings } from '@erp/shared';
import { currentTenant } from './request-context.js';

/** An institute's timezone and settings with defaults applied (the request's institute by default). */
export async function loadInstitute(tx: Tx, instituteId: string = currentTenant().instituteId) {
  const [row] = await tx
    .select({ id: institutes.id, name: institutes.name, timezone: institutes.timezone, vertical: institutes.vertical, settings: institutes.settings })
    .from(institutes)
    .where(eq(institutes.id, instituteId));
  if (!row) throw new Error('institute not visible in this transaction');
  return { ...row, settings: effectiveSettings(row.settings, row.vertical) };
}

/** Calendar date (YYYY-MM-DD) at an instant in the given IANA timezone. */
export function localDate(timezone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** ISO weekday (1 = Monday ... 7 = Sunday) of a YYYY-MM-DD date. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The UTC instant of a local date and "HH:MM" time in an IANA timezone (DST-safe). */
export function zonedTimeToUtc(date: string, time: string, timezone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const wanted = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wanted;
  // Two passes settle the offset even across a DST change.
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
        .formatToParts(new Date(guess))
        .map((p) => [p.type, p.value]),
    );
    const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    guess += wanted - shown;
  }
  return new Date(guess);
}

/** The next time the clock reads `time` in the timezone, at or after `now`. */
export function nextLocalTime(now: Date, time: string, timezone: string): Date {
  const today = zonedTimeToUtc(localDate(timezone, now), time, timezone);
  return today >= now ? today : zonedTimeToUtc(addDays(localDate(timezone, now), 1), time, timezone);
}

/** "2 Nov" style date for messages to families. */
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}
