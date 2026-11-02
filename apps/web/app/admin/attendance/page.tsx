'use client';

import { ChevronLeft, ChevronRight, ClipboardCheck, Download, UserCheck, UserX } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { useApp } from '@/components/app/context';
import { PageHeader } from '@/components/app/page';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, Progress, Skeleton, StatCard } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { download } from '@/lib/api';
import { addDays, formatDate, formatTime, percent, todayLocal } from '@/lib/cn';
import { useApi } from '@/lib/query';
import type { DailySummary } from '@/lib/types';

export default function AttendancePage() {
  const { term } = useApp();
  const [date, setDate] = useState(todayLocal());
  const summary = useApi<DailySummary>(`/attendance/reports/daily?date=${date}`, { refetchInterval: date === todayLocal() ? 60_000 : undefined });
  const t = summary.data?.totals;

  return (
    <>
      <PageHeader
        title="Attendance"
        description={formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          <>
            <div className="flex items-center rounded-[10px] border border-border bg-surface shadow-soft">
              <Button variant="ghost" size="icon" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
                <ChevronLeft className="size-4" />
              </Button>
              <Input type="date" value={date} max={todayLocal()} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 w-40 border-0 shadow-none focus:ring-0" aria-label="Date" />
              <Button variant="ghost" size="icon" onClick={() => setDate(addDays(date, 1))} disabled={date >= todayLocal()} aria-label="Next day">
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={() => download(`/reports/attendance-defaulters?from=${addDays(date, -30)}&to=${date}&format=xlsx`, `attendance-below-75-${date}.xlsx`).catch((e) => toast.error(e.message))}
            >
              <Download className="size-4" /> Below 75%
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {t ? (
          <>
            <StatCard label="Attendance" value={percent(t.attendancePercent)} icon={UserCheck} tone="success" />
            <StatCard label="Absent" value={t.absent} icon={UserX} tone="danger" hint={`${t.late} late · ${t.leave} on leave`} />
            <StatCard label={`${term.section}s marked`} value={`${t.sectionsMarked}/${t.sections}`} icon={ClipboardCheck} tone="brand" />
            <StatCard label={`On time (by ${summary.data!.cutoffTime})`} value={`${t.sectionsMarkedOnTime}/${t.sections}`} icon={ClipboardCheck} tone="accent" />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[110px] rounded-[var(--radius-card)]" />)
        )}
      </div>

      <Card className="mt-6">
        {summary.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !summary.data?.sections.length ? (
          <EmptyState icon={ClipboardCheck} title={`No ${term.section.toLowerCase()}s this year`} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{term.section}</Th>
                <Th>Status</Th>
                <Th className="text-right">Present</Th>
                <Th className="text-right">Absent</Th>
                <Th className="w-48">Attendance</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {summary.data.sections.map((s) => {
                const c = s.counts;
                const total = c ? c.present + c.absent + c.late + c.halfDay + c.leave : 0;
                const pct = c && total ? ((c.present + c.late + c.halfDay / 2) / total) * 100 : null;
                return (
                  <Tr key={s.sectionId}>
                    <Td className="font-medium">
                      {s.className} · {s.sectionName}
                      <span className="block text-[12px] font-normal text-text-3">{s.enrolled} enrolled</span>
                    </Td>
                    <Td>
                      {s.closed ? (
                        <Badge>Closed · {s.closed}</Badge>
                      ) : !s.marked ? (
                        <Badge tone="warning" dot>
                          Not marked
                        </Badge>
                      ) : (
                        <Badge tone={s.markedOnTime ? 'success' : 'warning'} dot>
                          {s.markedOnTime ? 'On time' : 'Late'} · {formatTime(s.markedAt)}
                        </Badge>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{c ? c.present + c.late : '—'}</Td>
                    <Td className="text-right tabular-nums text-danger">{c ? c.absent : '—'}</Td>
                    <Td>
                      {pct !== null ? (
                        <span className="flex items-center gap-2">
                          <Progress value={pct} tone={pct >= 90 ? 'success' : pct >= 75 ? 'warning' : 'danger'} />
                          <span className="w-12 text-right text-[12.5px] tabular-nums text-text-2">{percent(pct)}</span>
                        </span>
                      ) : (
                        <span className="text-text-3">—</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <Link href={`/admin/attendance/${s.sectionId}?month=${date.slice(0, 7)}`} className="text-[13px] font-medium text-brand hover:underline">
                        Register
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
