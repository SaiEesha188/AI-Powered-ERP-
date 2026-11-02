'use client';

import { CalendarDays, ExternalLink, FileText, Library } from 'lucide-react';
import { useState } from 'react';
import { useChild } from '@/components/app/child';
import { EVENT_TYPE } from '@/components/app/status';
import { EmptyState, Skeleton } from '@/components/ui/card';
import { Tabs } from '@/components/ui/overlay';
import { fileUrl } from '@/lib/api';
import { addDays, cn, formatDate, todayLocal } from '@/lib/cn';
import { useApi } from '@/lib/query';
import type { CalendarEvent, Material } from '@/lib/types';

export default function ParentLearn() {
  const [tab, setTab] = useState('materials');
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Learn & plan</h1>
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'materials', label: 'Study material' },
          { value: 'calendar', label: 'School calendar' },
        ]}
      />
      {tab === 'materials' ? <Materials /> : <Calendar />}
    </div>
  );
}

function Materials() {
  const { child } = useChild();
  const list = useApi<Material[]>(`/family/children/${child.id}/materials`);
  if (list.isLoading) return <Skeleton className="h-48 rounded-2xl" />;
  if (!list.data?.length) return <EmptyState icon={Library} title="No study material yet" description="Teachers share notes, worksheets and videos here by chapter." />;
  const bySubject = new Map<string, Material[]>();
  for (const m of list.data) bySubject.set(m.subjectName, [...(bySubject.get(m.subjectName) ?? []), m]);
  return (
    <div className="space-y-5">
      {[...bySubject.entries()].map(([subject, items]) => (
        <section key={subject}>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-text-3">{subject}</h2>
          <ul className="space-y-2">
            {items.map((m) => {
              const href = m.type === 'file' && m.file ? fileUrl(m.file.url) : (m.url ?? '#');
              return (
                <li key={m.id}>
                  <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-soft active:bg-surface-2">
                    <span className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-xl', m.type === 'file' ? 'bg-brand-soft text-brand' : 'bg-accent-soft text-accent')}>
                      {m.type === 'file' ? <FileText className="size-5" /> : <ExternalLink className="size-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium">{m.title}</span>
                      <span className="block truncate text-[12.5px] text-text-3">{m.chapter ?? m.description ?? (m.type === 'file' ? m.file?.name : 'Link')}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Calendar() {
  const today = todayLocal();
  const events = useApi<CalendarEvent[]>(`/family/calendar?from=${today}&to=${addDays(today, 90)}`);
  if (events.isLoading) return <Skeleton className="h-48 rounded-2xl" />;
  if (!events.data?.length) return <EmptyState icon={CalendarDays} title="Nothing scheduled" description="Holidays, exams and events for the next three months appear here." />;
  return (
    <ul className="space-y-2.5">
      {events.data.map((e) => (
        <li key={e.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
          <span className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-surface-2 py-1.5">
            <span className="text-[10px] font-semibold uppercase text-text-3">{formatDate(e.startDate, { month: 'short' })}</span>
            <span className="text-lg font-semibold leading-tight">{formatDate(e.startDate, { day: 'numeric' })}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-medium">{e.title}</span>
            <span className="block text-[12.5px] text-text-3">
              {formatDate(e.startDate, { weekday: 'long' })}
              {e.endDate !== e.startDate ? ` – ${formatDate(e.endDate, { day: 'numeric', month: 'short' })}` : ''}
            </span>
          </span>
          <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', EVENT_TYPE[e.type]?.chip)}>{EVENT_TYPE[e.type]?.label}</span>
        </li>
      ))}
    </ul>
  );
}
