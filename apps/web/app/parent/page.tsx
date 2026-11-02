'use client';

import { Bell, BookOpen, CalendarDays, CheckCircle2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useChild } from '@/components/app/child';
import { ListCard } from '@/components/app/mobile-shell';
import { Section } from '@/components/app/page';
import { EVENT_TYPE } from '@/components/app/status';
import { Badge, Skeleton } from '@/components/ui/card';
import { cn, formatDate, relativeDay } from '@/lib/cn';
import { useApi } from '@/lib/query';
import type { CalendarEvent } from '@/lib/types';

interface Summary {
  attendanceThisMonth: { percent: number | null; present: number; absent: number; late: number; marked: number };
  pendingHomework: { id: string; title: string; dueDate: string; subjectName: string }[];
  upcomingEvents: CalendarEvent[];
  unreadCirculars: number;
}

/** A ring showing this month's attendance; green at 90%+, amber at 75%+, red below. */
function Ring({ value }: { value: number | null }) {
  const pct = value ?? 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = value === null ? 'var(--border-strong)' : pct >= 90 ? '#5fd4c8' : pct >= 75 ? '#f5b55a' : '#f2768b';
  return (
    <svg viewBox="0 0 80 80" className="size-24 -rotate-90" aria-hidden>
      <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(255 255 255 / 0.15)" strokeWidth="8" />
      <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset 700ms ease-out' }} />
    </svg>
  );
}

export default function ParentHome() {
  const { child } = useChild();
  const s = useApi<Summary>(`/family/children/${child.id}/summary`);
  if (!s.data) return <Skeleton className="h-72 rounded-3xl" />;
  const a = s.data.attendanceThisMonth;

  return (
    <div className="space-y-6">
      <Link href="/parent/attendance" className="block rounded-3xl bg-gradient-to-br from-[#1e3a5f] via-[#24466f] to-[#0f6f68] p-5 text-white shadow-card active:scale-[0.99]">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Ring value={a.percent} />
            <span className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-semibold tabular-nums">{a.percent === null ? '—' : `${Math.round(a.percent)}%`}</span>
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] text-white/70">Attendance this month</p>
            <p className="mt-1 text-lg font-semibold leading-snug">{a.marked === 0 ? 'No days marked yet' : a.absent === 0 ? 'Present every day so far' : `${a.absent} day${a.absent > 1 ? 's' : ''} absent`}</p>
            <p className="mt-1 text-[12.5px] text-white/70">
              {a.present} present · {a.late} late · {a.marked} marked
            </p>
          </div>
        </div>
      </Link>

      {s.data.unreadCirculars > 0 && (
        <ListCard href="/parent/notices" className="flex items-center gap-3 border-warning/40 bg-warning-soft/60">
          <Bell className="size-5 text-warning" />
          <span className="flex-1 text-[14.5px] font-medium">
            {s.data.unreadCirculars} new notice{s.data.unreadCirculars > 1 ? 's' : ''} from school
          </span>
          <ChevronRight className="size-5 text-text-3" />
        </ListCard>
      )}

      <Section title="Homework due" action={<Link href="/parent/homework" className="text-[13px] font-medium text-brand">See all</Link>}>
        {s.data.pendingHomework.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-[14px] text-success">
            <CheckCircle2 className="size-5" /> Nothing pending
          </div>
        ) : (
          <ul className="space-y-2.5">
            {s.data.pendingHomework.slice(0, 4).map((h) => (
              <li key={h.id}>
                <ListCard href="/parent/homework" className="flex items-center gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <BookOpen className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">{h.title}</span>
                    <span className="block text-[12.5px] text-text-3">{h.subjectName}</span>
                  </span>
                  <Badge tone={relativeDay(h.dueDate) === 'Today' ? 'warning' : 'neutral'}>{relativeDay(h.dueDate)}</Badge>
                </ListCard>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Coming up">
        {s.data.upcomingEvents.length === 0 ? (
          <p className="flex items-center gap-2 text-[14px] text-text-3">
            <CalendarDays className="size-4" /> Nothing in the next two weeks
          </p>
        ) : (
          <ul className="space-y-2.5">
            {s.data.upcomingEvents.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
                <span className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-surface-2 py-1.5">
                  <span className="text-[10px] font-semibold uppercase text-text-3">{formatDate(e.startDate, { month: 'short' })}</span>
                  <span className="text-lg font-semibold leading-tight">{formatDate(e.startDate, { day: 'numeric' })}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium">{e.title}</span>
                  <span className="block text-[12.5px] text-text-3">{relativeDay(e.startDate)}</span>
                </span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', EVENT_TYPE[e.type]?.chip)}>{EVENT_TYPE[e.type]?.label}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
