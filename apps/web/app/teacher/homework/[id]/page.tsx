'use client';

import { ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { AttachmentList } from '@/components/app/attachments';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardBody, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { cn, relativeDay, todayLocal } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { Homework } from '@/lib/types';

type Mark = 'done' | 'late' | 'pending';
interface Detail extends Homework {
  students: { studentId: string; name: string; rollNo: number | null; status: Mark | null; feedback: string | null }[];
}

const OPTIONS: { value: Mark; label: string; on: string }[] = [
  { value: 'done', label: 'Done', on: 'bg-success text-white' },
  { value: 'late', label: 'Late', on: 'bg-warning text-white' },
  { value: 'pending', label: 'Not done', on: 'bg-danger text-white' },
];

export default function HomeworkReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const hw = useApi<Detail>(`/homework/${id}`);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (hw.data) setMarks(Object.fromEntries(hw.data.students.filter((s) => s.status).map((s) => [s.studentId, s.status!])));
  }, [hw.data]);
  const save = useMutate((records: object[]) => api(`/homework/${id}/completion`, { method: 'PUT', body: { records } }), {
    invalidate: ['/homework', '/dashboards'],
    success: 'Saved',
  });
  const cancel = useMutate(() => api(`/homework/${id}`, { method: 'DELETE' }), {
    invalidate: ['/homework', '/dashboards'],
    success: 'Homework withdrawn',
    onSuccess: () => router.push('/teacher/homework'),
  });

  if (!hw.data) return <Skeleton className="h-96 rounded-2xl" />;
  const h = hw.data;
  const changed = Object.entries(marks).filter(([sid, m]) => h.students.find((s) => s.studentId === sid)?.status !== m);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/teacher/homework" className="-ml-2 rounded-xl p-2 text-text-2 active:bg-surface-2" aria-label="Back">
          <ArrowLeft className="size-5" />
        </Link>
        <span className="flex-1 text-[13px] text-text-3">
          {h.className} · {h.sectionName}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setConfirm(true)} aria-label="Withdraw homework">
          <Trash2 className="size-5 text-danger" />
        </Button>
      </div>

      <Card>
        <CardBody>
          <div className="flex items-center gap-2">
            <Badge tone="brand">{h.subjectName}</Badge>
            <Badge tone={h.dueDate === todayLocal() ? 'warning' : 'neutral'}>Due {relativeDay(h.dueDate).toLowerCase()}</Badge>
          </div>
          <h1 className="mt-3 text-lg font-semibold leading-snug">{h.title}</h1>
          {h.instructions && <p className="mt-2 whitespace-pre-wrap text-[14px] text-text-2">{h.instructions}</p>}
          {h.attachments.length > 0 && (
            <div className="mt-3">
              <AttachmentList files={h.attachments} />
            </div>
          )}
        </CardBody>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-3">Who did it</h2>
        <Button variant="ghost" size="sm" onClick={() => setMarks(Object.fromEntries(h.students.map((s) => [s.studentId, 'done' as Mark])))}>
          Mark all done
        </Button>
      </div>
      <ul className="space-y-2">
        {h.students.map((s) => (
          <li key={s.studentId} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5">
            <Avatar name={s.name} size={36} />
            <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{s.name}</span>
            <div className="flex gap-1" role="group" aria-label={`${s.name} homework`}>
              {OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setMarks((m) => ({ ...m, [s.studentId]: o.value }))}
                  aria-pressed={marks[s.studentId] === o.value}
                  className={cn('h-9 rounded-xl px-2.5 text-[12px] font-semibold transition-colors', marks[s.studentId] === o.value ? o.on : 'bg-surface-2 text-text-3')}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <Button size="lg" className="sticky bottom-24 w-full shadow-pop" disabled={!changed.length} loading={save.isPending} onClick={() => save.mutate(changed.map(([studentId, status]) => ({ studentId, status })))}>
        Save {changed.length ? `${changed.length} change${changed.length > 1 ? 's' : ''}` : ''}
      </Button>

      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Withdraw this homework?"
        description="It disappears from the parent app. If the digest has not gone out yet, parents won’t be told about it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep
            </Button>
            <Button variant="danger" onClick={() => cancel.mutate(undefined)} loading={cancel.isPending}>
              Withdraw
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-2">{h.title}</p>
      </Dialog>
    </div>
  );
}
