'use client';

import { Bell, BookOpenCheck, CheckCircle2, ChevronRight, ClipboardCheck, PenLine, Sun } from 'lucide-react';
import Link from 'next/link';
import { Section } from '@/components/app/page';
import { ListCard } from '@/components/app/mobile-shell';
import { buttonStyles } from '@/components/ui/button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/card';
import { cn, formatDate, relativeDay } from '@/lib/cn';
import { useApi } from '@/lib/query';

interface TeacherDashboard {
  date: string;
  sections: { id: string; name: string; className: string; isClassTeacher: boolean; mySubjects: { id: string; name: string }[]; attendanceMarkedToday: boolean }[];
  homeworkAwaitingReview: { id: string; title: string; dueDate: string; subjectName: string }[];
  unreadCirculars: number;
}

export default function TeacherToday() {
  const d = useApi<TeacherDashboard>('/dashboards/teacher', { refetchInterval: 60_000 });
  if (!d.data) return <Skeleton className="h-64 rounded-2xl" />;
  const { sections, homeworkAwaitingReview, unreadCirculars } = d.data;
  const toMark = sections.filter((s) => !s.attendanceMarkedToday);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-[#1e3a5f] to-[#2b5080] p-5 text-white shadow-card">
        <p className="flex items-center gap-2 text-[13px] text-white/70">
          <Sun className="size-4" /> {formatDate(d.data.date, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <p className="mt-2 text-xl font-semibold leading-snug">
          {sections.length === 0 ? 'No sections assigned to you yet' : toMark.length === 0 ? 'All your attendance is in. Nice.' : `${toMark.length} register${toMark.length > 1 ? 's' : ''} to take`}
        </p>
        {toMark[0] && (
          <Link href={`/teacher/attendance/${toMark[0].id}`} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[14px] font-semibold text-[#1e3a5f] shadow-soft active:scale-[0.98]">
            <ClipboardCheck className="size-5" /> Take {toMark[0].className} · {toMark[0].name}
          </Link>
        )}
      </div>

      <Section title="My classes">
        {sections.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="Nothing assigned" description="Ask the office to assign your sections and subjects." />
        ) : (
          <ul className="space-y-2.5">
            {sections.map((s) => (
              <li key={s.id}>
                <ListCard href={`/teacher/attendance/${s.id}`} className="flex items-center gap-3">
                  <span className={cn('inline-flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold', s.attendanceMarkedToday ? 'bg-success-soft text-success' : 'bg-brand-soft text-brand')}>{s.name}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[15px] font-semibold">
                      {s.className} · {s.name}
                      {s.isClassTeacher && <Badge tone="accent">Class teacher</Badge>}
                    </span>
                    <span className="block truncate text-[13px] text-text-3">{s.mySubjects.map((x) => x.name).join(', ') || 'Class teacher'}</span>
                  </span>
                  {s.attendanceMarkedToday ? <CheckCircle2 className="size-6 text-success" aria-label="Attendance taken" /> : <ChevronRight className="size-5 text-text-3" />}
                </ListCard>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/teacher/homework/new" className={cn(buttonStyles({ variant: 'outline', size: 'xl' }), 'h-auto flex-col gap-1.5 py-4')}>
          <PenLine className="size-6 text-accent" /> Post homework
        </Link>
        <Link href="/teacher/inbox" className={cn(buttonStyles({ variant: 'outline', size: 'xl' }), 'relative h-auto flex-col gap-1.5 py-4')}>
          <Bell className="size-6 text-brand" /> Notices
          {unreadCirculars > 0 && <span className="absolute right-3 top-3 rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">{unreadCirculars}</span>}
        </Link>
      </div>

      {homeworkAwaitingReview.length > 0 && (
        <Section title="Homework to check">
          <ul className="space-y-2.5">
            {homeworkAwaitingReview.map((h) => (
              <li key={h.id}>
                <ListCard href={`/teacher/homework/${h.id}`} className="flex items-center gap-3">
                  <BookOpenCheck className="size-5 shrink-0 text-warning" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">{h.title}</span>
                    <span className="block text-[12.5px] text-text-3">
                      {h.subjectName} · due {relativeDay(h.dueDate).toLowerCase()}
                    </span>
                  </span>
                  <ChevronRight className="size-5 text-text-3" />
                </ListCard>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
