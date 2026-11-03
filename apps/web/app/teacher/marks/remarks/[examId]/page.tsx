'use client';

import { ArrowLeft, CheckCircle2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, use, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, EmptyState, Skeleton } from '@/components/ui/card';
import { Textarea } from '@/components/ui/form';
import { api } from '@/lib/api';
import { percent } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { MarksTask, ReportCardRow } from '@/lib/types';

const SUGGESTIONS = ['Consistent and attentive in class. Keep it up.', 'Good effort; needs regular practice in weaker subjects.', 'Participates well. Can improve with more focus on written work.', 'Shows strong understanding. Encourage reading beyond the textbook.'];

/** Class teacher writes a remark per student once report cards exist for the section. */
function Remarks({ examId }: { examId: string }) {
  const sectionId = useSearchParams().get('sectionId') ?? '';
  const task = useApi<MarksTask[]>('/exams/my-tasks').data?.find((t) => t.examId === examId && t.sectionId === sectionId);
  const cards = useApi<ReportCardRow[]>(`/exams/${examId}/report-cards`);
  const rows = (cards.data ?? []).filter((c) => !task || c.sectionName === task.sectionName);
  return (
    <div className="space-y-4">
      <Link href="/teacher/marks" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-3">
        <ArrowLeft className="size-4" /> Marks
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Remarks</h1>
        <p className="text-[13.5px] text-text-3">
          {task ? `${task.examName} · ${task.className} · ${task.sectionName}` : 'Report cards'} · {rows.filter((r) => r.hasRemarks).length}/{rows.length} written
        </p>
      </div>
      {cards.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !rows.length ? (
        <EmptyState icon={Sparkles} title="Report cards not generated yet" description="The office generates them once every section of the exam is locked. Check back then." />
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => (
            <RemarkRow key={c.id} card={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RemarkRow({ card }: { card: ReportCardRow }) {
  const detail = useApi<{ remarks: string | null; status: string }>(`/report-cards/${card.id}`);
  const [text, setText] = useState<string | null>(null);
  const save = useMutate((body: object) => api(`/report-cards/${card.id}/remarks`, { method: 'PATCH', body }), { invalidate: ['/report-cards', '/exams'], success: 'Saved', onSuccess: () => setText(null) });
  const value = text ?? detail.data?.remarks ?? '';
  const final = card.status === 'published';
  return (
    <li className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-3">
        <Avatar name={card.name} size={38} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{card.name}</span>
          <span className="block text-[12.5px] text-text-3">
            {percent(card.percent)} · Grade {card.grade ?? '—'} · Rank {card.rank ?? '—'}
          </span>
        </span>
        {card.passed ? <Badge tone="success">Passed</Badge> : <Badge tone="danger">Failed</Badge>}
      </div>
      {final ? (
        <p className="mt-3 text-[14px] text-text-2">{detail.data?.remarks ?? <span className="italic text-text-3">No remarks</span>}</p>
      ) : (
        <>
          <Textarea className="mt-3 min-h-20" placeholder="A line or two for the family…" value={value} onChange={(e) => setText(e.target.value)} />
          {!value && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => setText(s)} className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-[12px] text-text-2 active:bg-brand-soft">
                  {s.split('.')[0]}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center justify-end gap-2">
            {card.hasRemarks && text === null && (
              <span className="flex items-center gap-1 text-[12px] text-success">
                <CheckCircle2 className="size-3.5" /> Saved
              </span>
            )}
            <Button size="sm" onClick={() => save.mutate({ remarks: value || null })} loading={save.isPending} disabled={text === null || text === (detail.data?.remarks ?? '')}>
              Save
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

export default function Page({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <Remarks examId={examId} />
    </Suspense>
  );
}
