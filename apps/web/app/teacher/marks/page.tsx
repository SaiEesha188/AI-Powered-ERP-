'use client';

import { CheckCircle2, ChevronRight, ClipboardPen, Lock, MessageSquareQuote } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ListCard } from '@/components/app/mobile-shell';
import { Section } from '@/components/app/page';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Progress, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { MarksTask } from '@/lib/types';

/** Everything a teacher owes for open exams, grouped by exam then section. Class teachers also lock and write remarks here. */
export default function TeacherMarks() {
  const tasks = useApi<MarksTask[]>('/exams/my-tasks', { refetchInterval: 60_000 });
  const [lockTarget, setLockTarget] = useState<{ examId: string; sectionId: string; label: string } | null>(null);
  const lock = useMutate((t: { examId: string; sectionId: string }) => api(`/exams/${t.examId}/sections/${t.sectionId}/lock`, { method: 'POST' }), {
    invalidate: ['/exams'],
    success: 'Section locked. The office can now generate report cards.',
    onSuccess: () => setLockTarget(null),
  });

  if (tasks.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  const list = tasks.data ?? [];
  if (!list.length) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold tracking-tight">Marks</h1>
        <EmptyState icon={ClipboardPen} title="No marks to enter" description="Papers appear here once the office publishes an exam date sheet." />
      </div>
    );
  }

  // exam → section → papers
  const exams = new Map<string, { name: string; status: MarksTask['status']; sections: Map<string, MarksTask[]> }>();
  for (const t of list) {
    const e = exams.get(t.examId) ?? { name: t.examName, status: t.status, sections: new Map() };
    e.sections.set(t.sectionId, [...(e.sections.get(t.sectionId) ?? []), t]);
    exams.set(t.examId, e);
  }
  const owed = list.filter((t) => !t.locked && t.entered < t.students).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Marks</h1>
        <p className="text-[13.5px] text-text-3">{owed ? `${owed} paper${owed > 1 ? 's' : ''} still to enter` : 'Everything is entered'}</p>
      </div>
      {[...exams.entries()].map(([examId, e]) => (
        <Section key={examId} title={e.name}>
          <div className="space-y-4">
            {[...e.sections.entries()].map(([sectionId, papers]) => {
              const first = papers[0]!;
              const expected = papers.reduce((n, p) => n + p.students, 0);
              const entered = papers.reduce((n, p) => n + p.entered, 0);
              const complete = expected > 0 && entered === expected;
              const locked = first.locked;
              return (
                <div key={sectionId} className="rounded-2xl border border-border bg-surface shadow-soft">
                  <div className="flex items-center gap-3 px-4 pt-4">
                    <span className={cn('inline-flex size-11 shrink-0 items-center justify-center rounded-2xl text-base font-semibold', locked ? 'bg-success-soft text-success' : 'bg-brand-soft text-brand')}>{first.sectionName}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[15px] font-semibold">
                        {first.className} · {first.sectionName}
                        {first.isClassTeacher && <Badge tone="accent">Class teacher</Badge>}
                      </span>
                      <span className="block text-[12.5px] text-text-3">
                        {entered}/{expected} marks entered
                      </span>
                    </span>
                    {locked && (
                      <Badge tone="success">
                        <Lock className="size-3" /> Locked
                      </Badge>
                    )}
                  </div>
                  <div className="px-4 pt-3">
                    <Progress value={expected ? (entered / expected) * 100 : 0} tone={locked ? 'success' : complete ? 'accent' : 'brand'} />
                  </div>
                  <ul className="mt-3 divide-y divide-border border-t border-border">
                    {papers.map((p) => {
                      const done = p.entered === p.students && p.students > 0;
                      return (
                        <li key={p.paperId}>
                          <Link href={`/teacher/marks/${p.paperId}?sectionId=${p.sectionId}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                            <span className="min-w-0 flex-1">
                              <span className="block text-[14.5px] font-medium">{p.subjectName}</span>
                              <span className="block text-[12.5px] text-text-3">
                                {p.date ? formatDate(p.date, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Date to be set'} · out of {p.maxMarks}
                              </span>
                            </span>
                            {done ? (
                              <span className="flex items-center gap-1 text-[12.5px] font-medium text-success">
                                <CheckCircle2 className="size-4" /> {p.locked ? 'Final' : 'Done'}
                              </span>
                            ) : (
                              <span className="text-[12.5px] font-medium text-text-3">
                                {p.entered}/{p.students}
                              </span>
                            )}
                            <ChevronRight className="size-5 text-text-3" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  {first.isClassTeacher && (
                    <div className="flex gap-2 border-t border-border p-3">
                      {locked ? (
                        <Link href={`/teacher/marks/remarks/${examId}?sectionId=${sectionId}`} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-soft px-4 py-3 text-[14px] font-semibold text-brand active:scale-[0.98]">
                          <MessageSquareQuote className="size-4" /> Write remarks
                        </Link>
                      ) : (
                        <Button className="flex-1" size="lg" variant={complete ? 'primary' : 'outline'} disabled={!complete} onClick={() => setLockTarget({ examId, sectionId, label: `${first.className} · ${first.sectionName}` })}>
                          <Lock className="size-4" /> {complete ? 'Lock section' : 'Lock once all marks are in'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      ))}
      {list.some((t) => t.isClassTeacher) && (
        <ListCard className="py-3 text-[12.5px] text-text-3">Locking a section tells the office every subject teacher has finished. After that, marks only change with a reason, and the office generates report cards.</ListCard>
      )}
      <Dialog
        open={!!lockTarget}
        onOpenChange={() => setLockTarget(null)}
        title={`Lock ${lockTarget?.label ?? ''}?`}
        description="Subject teachers can no longer change marks for this section without a reason. The office can reopen it if needed."
        footer={
          <Button onClick={() => lockTarget && lock.mutate(lockTarget)} loading={lock.isPending}>
            Lock section
          </Button>
        }
      >
        <p className="text-sm text-text-2">Check that every paper shows “Done” before locking.</p>
      </Dialog>
    </div>
  );
}
