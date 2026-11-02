'use client';

import { BookOpen, ChevronRight, Paperclip, Plus, Zap } from 'lucide-react';
import Link from 'next/link';
import { ListCard } from '@/components/app/mobile-shell';
import { Section } from '@/components/app/page';
import { Badge, EmptyState, Skeleton } from '@/components/ui/card';
import { addDays, relativeDay, todayLocal } from '@/lib/cn';
import { useApi } from '@/lib/query';
import type { Homework } from '@/lib/types';

export default function TeacherHomework() {
  const today = todayLocal();
  const list = useApi<Homework[]>(`/homework?mine=true&from=${addDays(today, -21)}`);
  const items = (list.data ?? []).filter((h) => h.status === 'published');
  const upcoming = items.filter((h) => h.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const past = items.filter((h) => h.dueDate < today);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Homework</h1>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : items.length === 0 ? (
        <EmptyState icon={BookOpen} title="No homework posted yet" description="Post once and every parent gets it in the evening digest." />
      ) : (
        <>
          <Section title="Due soon">{upcoming.length ? <HomeworkList items={upcoming} /> : <p className="text-sm text-text-3">Nothing due.</p>}</Section>
          {past.length > 0 && (
            <Section title="Past">
              <HomeworkList items={past} />
            </Section>
          )}
        </>
      )}
      <Link
        href="/teacher/homework/new"
        className="fixed bottom-24 right-[max(1rem,calc(50vw-14rem+1rem))] z-30 inline-flex h-14 items-center gap-2 rounded-2xl bg-accent px-5 text-[15px] font-semibold text-white shadow-pop active:scale-95"
      >
        <Plus className="size-5" /> New
      </Link>
    </div>
  );
}

function HomeworkList({ items }: { items: Homework[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((h) => {
        const c = typeof h.completion === 'object' && h.completion ? h.completion : null;
        return (
          <li key={h.id}>
            <ListCard href={`/teacher/homework/${h.id}`} className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <Badge tone="brand">{h.subjectName}</Badge>
                  <span className="text-[12px] text-text-3">
                    {h.className} · {h.sectionName}
                  </span>
                </span>
                <span className="mt-1.5 flex items-center gap-1.5 text-[15px] font-medium">
                  {h.isUrgent && <Zap className="size-4 fill-warning text-warning" aria-label="Urgent" />}
                  <span className="truncate">{h.title}</span>
                  {h.attachments.length > 0 && <Paperclip className="size-3.5 shrink-0 text-text-3" />}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-text-3">
                  Due {relativeDay(h.dueDate).toLowerCase()}
                  {c && c.done + c.late > 0 ? ` · ${c.done + c.late} checked` : ''}
                </span>
              </span>
              <ChevronRight className="size-5 text-text-3" />
            </ListCard>
          </li>
        );
      })}
    </ul>
  );
}
