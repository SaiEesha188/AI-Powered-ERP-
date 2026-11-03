'use client';

import { Award, CalendarDays, ChevronRight, GraduationCap } from 'lucide-react';
import { useChild } from '@/components/app/child';
import { ListCard } from '@/components/app/mobile-shell';
import { Section } from '@/components/app/page';
import { Badge, EmptyState, Skeleton } from '@/components/ui/card';
import { cn, formatDate, percent, todayLocal } from '@/lib/cn';
import { useApi } from '@/lib/query';
import type { ChildExam, ChildResult } from '@/lib/types';

export default function ParentResults() {
  const { child } = useChild();
  const exams = useApi<ChildExam[]>(`/family/children/${child.id}/exams`);
  const results = useApi<ChildResult[]>(`/family/children/${child.id}/report-cards`);
  const today = todayLocal();
  if (exams.isLoading || results.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  const upcoming = (exams.data ?? []).filter((e) => e.status !== 'published');
  const cards = results.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Results</h1>

      {upcoming.length > 0 && (
        <Section title="Date sheet">
          <div className="space-y-3">
            {upcoming.map((e) => (
              <div key={e.examId} className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-semibold">{e.examName}</p>
                  <Badge tone="info">
                    <CalendarDays className="size-3" /> {formatDate(e.startDate, { day: 'numeric', month: 'short' })} – {formatDate(e.endDate, { day: 'numeric', month: 'short' })}
                  </Badge>
                </div>
                <ul className="mt-3 divide-y divide-border">
                  {e.papers.map((p) => {
                    const past = p.date !== null && p.date < today;
                    return (
                      <li key={`${p.subject}-${p.date}`} className={cn('flex gap-3 py-2.5', past && 'opacity-60')}>
                        <span className="w-14 shrink-0 text-center">
                          {p.date ? (
                            <>
                              <span className="block text-[11px] font-medium uppercase text-text-3">{formatDate(p.date, { weekday: 'short' })}</span>
                              <span className="block text-lg font-semibold leading-tight tabular-nums">{formatDate(p.date, { day: 'numeric' })}</span>
                              <span className="block text-[11px] text-text-3">{formatDate(p.date, { month: 'short' })}</span>
                            </>
                          ) : (
                            <span className="text-[12px] text-text-3">TBA</span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14.5px] font-medium">{p.subject}</span>
                          <span className="block text-[12.5px] text-text-3">
                            {p.maxMarks} marks{p.syllabusScope ? ` · ${p.syllabusScope}` : ''}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Report cards">
        {cards.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No report cards yet" description="You get a WhatsApp message the moment the school publishes one." />
        ) : (
          <ul className="space-y-2.5">
            {cards.map((c) => (
              <li key={c.id}>
                <ListCard href={`/parent/results/${c.id}`} className="flex items-center gap-3">
                  <span className={cn('inline-flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold', c.passed ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>{c.grade ?? '—'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{c.examName}</span>
                    <span className="block text-[12.5px] text-text-3">
                      {c.assessmentType} · {percent(c.percent)} · {formatDate(c.endDate, { month: 'short', year: 'numeric' })}
                    </span>
                  </span>
                  {c.passed && <Award className="size-5 text-success" aria-label="Passed" />}
                  <ChevronRight className="size-5 text-text-3" />
                </ListCard>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
