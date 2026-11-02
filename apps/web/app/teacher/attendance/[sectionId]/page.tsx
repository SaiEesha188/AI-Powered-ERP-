'use client';

import { ArrowLeft, CalendarOff, CheckCircle2, CloudOff, Lock, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ATTENDANCE } from '@/components/app/status';
import { Button } from '@/components/ui/button';
import { Avatar, Skeleton } from '@/components/ui/card';
import { ApiError, api } from '@/lib/api';
import { cn, formatTime, todayLocal } from '@/lib/cn';
import { enqueue, usePendingAttendance } from '@/lib/offline';
import { useApi, useMutate } from '@/lib/query';
import type { AttendanceStatus, Roster } from '@/lib/types';
import { useQueryClient } from '@tanstack/react-query';

const QUICK: AttendanceStatus[] = ['absent', 'late', 'leave'];

export default function TakeAttendance({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = use(params);
  const router = useRouter();
  const client = useQueryClient();
  const date = todayLocal();
  const roster = useApi<Roster>(`/attendance/sections/${sectionId}?date=${date}`);
  const teaching = useApi<{ sections: { id: string; name: string; className: string }[] }>('/me/teaching');
  const pending = usePendingAttendance().find((p) => p.sectionId === sectionId && p.date === date);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const section = teaching.data?.sections.find((s) => s.id === sectionId);
  const label = section ? `${section.className} · ${section.name}` : 'Attendance';

  // Start from what is saved (server or this phone); unmarked students are present (ATT-02).
  useEffect(() => {
    if (!roster.data) return;
    const saved = Object.fromEntries(roster.data.students.map((s) => [s.studentId, s.status]));
    for (const r of pending?.records ?? []) saved[r.studentId] = r.status as AttendanceStatus;
    setMarks(saved);
  }, [roster.data, pending]);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, half_day: 0, leave: 0 };
    for (const s of Object.values(marks)) c[s] += 1;
    return c;
  }, [marks]);

  const save = useMutate(
    (records: { studentId: string; status: string }[]) => api<Roster & { newlyAbsent: string[] }>(`/attendance/sections/${sectionId}`, { method: 'PUT', body: { date, records } }),
    {
      invalidate: ['/attendance', '/dashboards'],
      success: (r) => (r.newlyAbsent.length ? `Saved · ${r.newlyAbsent.length} parent${r.newlyAbsent.length > 1 ? 's' : ''} will be alerted` : 'Attendance saved'),
      onSuccess: () => router.push('/teacher'),
      quietNetworkErrors: true,
    },
  );

  function submit() {
    const records = Object.entries(marks)
      .filter(([, s]) => s !== 'present')
      .map(([studentId, status]) => ({ studentId, status }));
    if (!navigator.onLine) return saveOffline(records);
    save.mutate(records, {
      onError: (e) => {
        // A failed request with no response means no signal: keep it on the phone instead.
        if (!(e instanceof ApiError)) saveOffline(records);
      },
    });
  }

  function saveOffline(records: { studentId: string; status: string }[]) {
    enqueue({ sectionId, sectionLabel: label, date, records, capturedAt: new Date().toISOString() });
    toast.success('Saved on this phone. It will send when you are back online.');
    client.invalidateQueries({ queryKey: ['/dashboards/teacher'] });
    router.push('/teacher');
  }

  const toggle = (id: string, status: AttendanceStatus) => setMarks((m) => ({ ...m, [id]: m[id] === status ? 'present' : status }));

  if (roster.isLoading || !roster.data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-40" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    );
  }
  const r = roster.data;
  const closed = !r.day.working;

  return (
    <div className="-mb-24">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/teacher" className="-ml-2 rounded-xl p-2 text-text-2 active:bg-surface-2" aria-label="Back">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">{label}</h1>
          <p className="text-[12.5px] text-text-3">
            Today · {r.students.length} students
            {r.marked && ` · taken at ${formatTime(r.markedAt)}`}
          </p>
        </div>
        {!closed && r.canEdit && (
          <Button variant="ghost" size="sm" onClick={() => setMarks(Object.fromEntries(r.students.map((s) => [s.studentId, 'present'])))}>
            <RotateCcw className="size-4" /> All present
          </Button>
        )}
      </div>

      {closed && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-surface-2 p-4 text-sm">
          <CalendarOff className="size-5 text-text-3" />
          <span>
            No classes today: <span className="font-semibold">{r.day.reason}</span>
          </span>
        </div>
      )}
      {!closed && !r.canEdit && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-warning-soft p-4 text-sm text-warning">
          <Lock className="size-5" /> You can view this register but not change it.
        </div>
      )}
      {pending && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-info-soft p-4 text-sm text-info">
          <CloudOff className="size-5" /> Saved on this phone, waiting for signal.
        </div>
      )}

      {!closed && (
        <>
          <p className="mb-2 text-[12.5px] text-text-3">Everyone starts present. Tap who is absent.</p>
          <ul className="space-y-2">
            {r.students.map((s) => {
              const status = marks[s.studentId] ?? 'present';
              const meta = ATTENDANCE[status];
              return (
                <li key={s.studentId}>
                  <div className={cn('flex items-center gap-3 rounded-2xl border p-2.5 pr-2 transition-colors', status === 'present' ? 'border-border bg-surface' : `border-transparent ${meta.cell}`)}>
                    <button
                      className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                      onClick={() => toggle(s.studentId, 'absent')}
                      disabled={!r.canEdit}
                      aria-label={`${s.name}: ${meta.label}. Tap to mark ${status === 'absent' ? 'present' : 'absent'}`}
                    >
                      <span className="relative">
                        <Avatar name={s.name} size={40} />
                        {status === 'present' && <CheckCircle2 className="absolute -bottom-1 -right-1 size-4 rounded-full bg-surface text-success" aria-hidden />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-medium text-text">{s.name}</span>
                        <span className="block text-[12px] text-text-3">
                          {s.rollNo ? `Roll ${s.rollNo}` : s.admissionNo} · <span className={status === 'present' ? 'text-success' : ''}>{meta.label}</span>
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 gap-1" role="group" aria-label={`Status for ${s.name}`}>
                      {QUICK.map((q) => (
                        <button
                          key={q}
                          disabled={!r.canEdit}
                          onClick={() => toggle(s.studentId, q)}
                          aria-pressed={status === q}
                          className={cn(
                            'h-9 min-w-10 rounded-xl px-2 text-[12px] font-bold transition-colors disabled:opacity-50',
                            status === q ? (q === 'absent' ? 'bg-danger text-white' : q === 'late' ? 'bg-warning text-white' : 'bg-brand text-on-brand') : 'bg-surface-2 text-text-3',
                          )}
                        >
                          {ATTENDANCE[q].short}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {!closed && r.canEdit && (
        <div className="sticky bottom-24 z-20 mt-5 rounded-2xl border border-border bg-surface/95 p-3 shadow-pop backdrop-blur-md">
          <div className="mb-2.5 flex justify-around text-center text-[12px] text-text-3">
            <span>
              <span className="block text-lg font-semibold text-success tabular-nums">{counts.present}</span>Present
            </span>
            <span>
              <span className="block text-lg font-semibold text-danger tabular-nums">{counts.absent}</span>Absent
            </span>
            <span>
              <span className="block text-lg font-semibold text-warning tabular-nums">{counts.late}</span>Late
            </span>
            <span>
              <span className="block text-lg font-semibold text-brand tabular-nums">{counts.leave}</span>Leave
            </span>
          </div>
          <Button size="lg" className="w-full" onClick={submit} loading={save.isPending}>
            {r.marked ? 'Update attendance' : 'Save attendance'}
          </Button>
        </div>
      )}
    </div>
  );
}
