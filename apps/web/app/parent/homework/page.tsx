'use client';

import { BookOpen, CheckCircle2, Clock3, Link2, MessageSquareQuote, Zap } from 'lucide-react';
import { AttachmentList } from '@/components/app/attachments';
import { useChild } from '@/components/app/child';
import { Badge, EmptyState, Skeleton } from '@/components/ui/card';
import { addDays, relativeDay, todayLocal } from '@/lib/cn';
import { useApi } from '@/lib/query';
import type { Homework } from '@/lib/types';

const MARK = {
  done: { label: 'Done', tone: 'success' as const, icon: CheckCircle2 },
  late: { label: 'Handed in late', tone: 'warning' as const, icon: Clock3 },
  pending: { label: 'Not done', tone: 'danger' as const, icon: Clock3 },
};

export default function ParentHomework() {
  const { child } = useChild();
  const today = todayLocal();
  const list = useApi<Homework[]>(`/family/children/${child.id}/homework?from=${addDays(today, -7)}&to=${addDays(today, 21)}`);

  if (list.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  const items = [...(list.data ?? [])].sort((a, b) => (a.dueDate < today) === (b.dueDate < today) ? a.dueDate.localeCompare(b.dueDate) : a.dueDate < today ? 1 : -1);
  const groups = new Map<string, Homework[]>();
  for (const h of items) groups.set(h.dueDate, [...(groups.get(h.dueDate) ?? []), h]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Homework</h1>
      {items.length === 0 ? (
        <EmptyState icon={BookOpen} title="No homework this week" description="New homework arrives in the evening digest on WhatsApp too." />
      ) : (
        [...groups.entries()].map(([date, hs]) => (
          <section key={date}>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-text-3">{date < today ? `Was due ${relativeDay(date).toLowerCase()}` : `Due ${relativeDay(date).toLowerCase()}`}</h2>
            <ul className="space-y-2.5">
              {hs.map((h) => {
                const mark = typeof h.completion === 'string' ? MARK[h.completion] : null;
                return (
                  <li key={h.id} className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="brand">{h.subjectName}</Badge>
                      {h.isUrgent && (
                        <Badge tone="warning">
                          <Zap className="size-3" /> Urgent
                        </Badge>
                      )}
                      {mark && (
                        <Badge tone={mark.tone}>
                          <mark.icon className="size-3" /> {mark.label}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 text-[15.5px] font-semibold leading-snug">{h.title}</p>
                    {h.instructions && <p className="mt-1 whitespace-pre-wrap text-[14px] text-text-2">{h.instructions}</p>}
                    {h.links.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {h.links.map((l) => (
                          <li key={l.url}>
                            <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-brand">
                              <Link2 className="size-4" /> {l.label ?? l.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    {h.attachments.length > 0 && (
                      <div className="mt-3">
                        <AttachmentList files={h.attachments} />
                      </div>
                    )}
                    {h.feedback && (
                      <p className="mt-3 flex gap-2 rounded-xl bg-surface-2 p-3 text-[13.5px] text-text-2">
                        <MessageSquareQuote className="size-4 shrink-0 text-text-3" /> {h.feedback}
                      </p>
                    )}
                    <p className="mt-3 text-[12px] text-text-3">Set by {h.teacherName}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
