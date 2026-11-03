'use client';

import { Lock, UserX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Skeleton } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { MarksGridData } from '@/lib/types';

type Entry = { marks: string; absent: boolean };

/**
 * Marks entry for one paper and section. Tab moves down the column so a teacher can type
 * straight from a paper register; "Ab" marks a student absent.
 */
export function MarksGrid({ paperId, sectionId, compact, onSaved }: { paperId: string; sectionId: string; compact?: boolean; onSaved?: () => void }) {
  const grid = useApi<MarksGridData>(`/exams/papers/${paperId}/marks?sectionId=${sectionId}`);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (grid.data) setEntries(Object.fromEntries(grid.data.students.map((s) => [s.studentId, { marks: s.marks === null ? '' : String(s.marks), absent: s.absent }])));
  }, [grid.data]);

  const save = useMutate(
    (body: object) => api<MarksGridData>(`/exams/papers/${paperId}/marks`, { method: 'PUT', body }),
    { invalidate: ['/exams'], success: 'Marks saved', onSuccess: () => (setReason(''), onSaved?.()) },
  );

  const max = grid.data?.paper.maxMarks ?? 0;
  const changed = useMemo(
    () => (grid.data?.students ?? []).filter((s) => {
      const e = entries[s.studentId];
      if (!e) return false;
      const value = e.absent || e.marks === '' ? null : Number(e.marks);
      return value !== s.marks || e.absent !== s.absent;
    }),
    [entries, grid.data],
  );
  const invalid = Object.values(entries).some((e) => !e.absent && e.marks !== '' && (Number.isNaN(Number(e.marks)) || Number(e.marks) < 0 || Number(e.marks) > max));
  const stats = useMemo(() => {
    const vals = Object.values(entries).filter((e) => !e.absent && e.marks !== '').map((e) => Number(e.marks));
    return { entered: vals.length + Object.values(entries).filter((e) => e.absent).length, avg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null };
  }, [entries]);

  if (!grid.data) return <Skeleton className="h-64 rounded-2xl" />;
  const { paper, locked, canEdit, students } = grid.data;
  const set = (id: string, patch: Partial<Entry>) => setEntries((e) => ({ ...e, [id]: { ...e[id]!, ...patch } }));

  function submit() {
    save.mutate({
      sectionId,
      entries: changed.map((s) => ({ studentId: s.studentId, marks: entries[s.studentId]!.absent || entries[s.studentId]!.marks === '' ? null : Number(entries[s.studentId]!.marks), absent: entries[s.studentId]!.absent })),
      reason: locked ? reason : undefined,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-3">
        <span>
          Out of <span className="font-semibold text-text">{paper.maxMarks}</span> · pass {paper.passMarks}
        </span>
        <span>·</span>
        <span>
          {stats.entered}/{students.length} entered{stats.avg !== null ? ` · average ${stats.avg}` : ''}
        </span>
        {locked && (
          <Badge tone="warning">
            <Lock className="size-3" /> Locked by class teacher
          </Badge>
        )}
      </div>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {students.map((s, i) => {
          const e = entries[s.studentId] ?? { marks: '', absent: false };
          const value = e.absent ? null : e.marks === '' ? null : Number(e.marks);
          const bad = !e.absent && e.marks !== '' && (Number.isNaN(value) || value! < 0 || value! > max);
          const fail = value !== null && !bad && value < paper.passMarks;
          return (
            <li key={s.studentId} className={cn('flex items-center gap-3 px-3 py-2', compact ? 'py-2.5' : 'py-2')}>
              <span className="w-7 shrink-0 text-right text-[12px] tabular-nums text-text-3">{s.rollNo ?? i + 1}</span>
              <Avatar name={s.name} size={compact ? 36 : 30} />
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate font-medium', compact ? 'text-[15px]' : 'text-sm')}>{s.name}</span>
                {fail && <span className="block text-[11.5px] text-danger">Below pass marks</span>}
                {bad && <span className="block text-[11.5px] text-danger">Enter 0 to {max}</span>}
              </span>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => set(s.studentId, { absent: !e.absent, marks: e.absent ? e.marks : '' })}
                aria-pressed={e.absent}
                className={cn('h-10 rounded-xl px-2.5 text-[12px] font-bold transition-colors disabled:opacity-50', e.absent ? 'bg-danger text-white' : 'bg-surface-2 text-text-3')}
                title="Absent"
              >
                <UserX className="size-4" />
              </button>
              <Input
                inputMode="decimal"
                aria-label={`${s.name} marks`}
                value={e.absent ? '' : e.marks}
                placeholder={e.absent ? 'Ab' : '—'}
                disabled={!canEdit || e.absent}
                onChange={(ev) => set(s.studentId, { marks: ev.target.value.replace(/[^\d.]/g, '') })}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') {
                    ev.preventDefault();
                    (document.querySelector(`[data-row="${i + 1}"] input`) as HTMLInputElement | null)?.focus();
                  }
                }}
                aria-invalid={bad}
                className={cn('h-10 w-20 text-center text-base font-semibold tabular-nums', compact && 'h-12 w-24')}
                data-row={i}
              />
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center', compact && 'sticky bottom-24 rounded-2xl border border-border bg-surface/95 p-3 shadow-pop backdrop-blur-md')}>
          {locked && <Input placeholder="Reason for correcting locked marks" value={reason} onChange={(e) => setReason(e.target.value)} className="flex-1" />}
          <Button size={compact ? 'lg' : 'md'} className={compact ? 'w-full' : 'sm:ml-auto'} onClick={submit} loading={save.isPending} disabled={!changed.length || invalid || (locked && reason.trim().length < 3)}>
            Save {changed.length ? `${changed.length} change${changed.length > 1 ? 's' : ''}` : 'marks'}
          </Button>
        </div>
      )}
      {!canEdit && !locked && paper.status === 'published' && <p className="text-[13px] text-text-3">Results are published; marks are final.</p>}
    </div>
  );
}
