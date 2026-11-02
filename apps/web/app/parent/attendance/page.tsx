'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useChild } from '@/components/app/child';
import { ATTENDANCE } from '@/components/app/status';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { addDays, cn, formatDate, todayLocal } from '@/lib/cn';
import { useApi } from '@/lib/query';
import type { AttendanceStatus } from '@/lib/types';

interface Month {
  days: { date: string; status: AttendanceStatus; remark: string | null }[];
  present: number;
  absent: number;
  late: number;
  leave: number;
  halfDay: number;
  total: number;
  percent: number | null;
}

function shift(month: string, by: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

export default function ParentAttendance() {
  const { child } = useChild();
  const today = todayLocal();
  const [month, setMonth] = useState(today.slice(0, 7));
  const data = useApi<Month>(`/family/children/${child.id}/attendance?month=${month}`);
  const first = `${month}-01`;
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const byDate = new Map((data.data?.days ?? []).map((d) => [d.date, d]));
  const absences = (data.data?.days ?? []).filter((d) => d.status !== 'present');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Attendance</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setMonth(shift(month, -1))} aria-label="Previous month">
            <ChevronLeft className="size-5" />
          </Button>
          <span className="w-24 text-center text-[14px] font-medium">{formatDate(first, { month: 'short', year: 'numeric' })}</span>
          <Button variant="ghost" size="icon" onClick={() => setMonth(shift(month, 1))} disabled={month >= today.slice(0, 7)} aria-label="Next month">
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </div>

      {!data.data ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'Present', value: data.data.present, cls: 'text-success' },
              { label: 'Absent', value: data.data.absent, cls: 'text-danger' },
              { label: 'Late', value: data.data.late, cls: 'text-warning' },
              { label: 'Leave', value: data.data.leave, cls: 'text-brand' },
            ].map((x) => (
              <div key={x.label} className="rounded-2xl border border-border bg-surface py-3">
                <p className={cn('text-xl font-semibold tabular-nums', x.cls)}>{x.value}</p>
                <p className="text-[11.5px] text-text-3">{x.label}</p>
              </div>
            ))}
          </div>

          <Card className="p-3">
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-text-3">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i} className="py-1">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: lead }, (_, i) => (
                <span key={`b${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const date = addDays(first, i);
                const rec = byDate.get(date);
                return (
                  <span
                    key={date}
                    title={rec ? ATTENDANCE[rec.status].label : undefined}
                    className={cn(
                      'flex aspect-square items-center justify-center rounded-xl text-[13px] font-semibold tabular-nums',
                      rec ? ATTENDANCE[rec.status].cell : 'text-text-3',
                      date === today && 'ring-2 ring-brand',
                    )}
                  >
                    {i + 1}
                  </span>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-3 border-t border-border pt-3 text-[12px] text-text-2">
              {(['present', 'absent', 'late', 'leave'] as const).map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className={cn('size-3 rounded', ATTENDANCE[k].cell)} /> {ATTENDANCE[k].label}
                </span>
              ))}
            </div>
          </Card>

          {absences.length > 0 && (
            <div>
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-text-3">Days missed</h2>
              <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
                {absences.map((d) => (
                  <li key={d.date} className="flex items-center justify-between px-4 py-3 text-[14px]">
                    <span>{formatDate(d.date, { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-semibold', ATTENDANCE[d.status].cell)}>{ATTENDANCE[d.status].label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
