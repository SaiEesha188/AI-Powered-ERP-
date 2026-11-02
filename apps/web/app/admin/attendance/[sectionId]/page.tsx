'use client';

import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardCheck, Download } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, use } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/page';
import { sectionLabel, useSections } from '@/components/app/pickers';
import { ATTENDANCE } from '@/components/app/status';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { download } from '@/lib/api';
import { cn, formatDate, percent, todayLocal } from '@/lib/cn';
import { useApi } from '@/lib/query';
import type { AttendanceStatus } from '@/lib/types';

interface Register {
  month: string;
  days: string[];
  sessionDays: string[];
  students: { studentId: string; name: string; admissionNo: string; rollNo: number | null; days: Record<string, string>; present: number; absent: number; late: number; leave: number; total: number; percent: number | null }[];
}

const CODE: Record<string, AttendanceStatus> = { P: 'present', A: 'absent', L: 'late', H: 'half_day', LV: 'leave' };

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

function RegisterView({ sectionId }: { sectionId: string }) {
  const router = useRouter();
  const month = useSearchParams().get('month') ?? todayLocal().slice(0, 7);
  const register = useApi<Register>(`/attendance/reports/register/${sectionId}?month=${month}`);
  const section = useSections().data?.find((s) => s.id === sectionId);
  const go = (m: string) => router.replace(`/admin/attendance/${sectionId}?month=${m}`);
  const r = register.data;

  return (
    <>
      <Link href="/admin/attendance" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-3 hover:text-text">
        <ArrowLeft className="size-4" /> Attendance
      </Link>
      <PageHeader
        title={section ? `${sectionLabel(section)} register` : 'Register'}
        description={formatDate(`${month}-01`, { month: 'long', year: 'numeric' })}
        actions={
          <>
            <div className="flex items-center rounded-[10px] border border-border bg-surface shadow-soft">
              <Button variant="ghost" size="icon" onClick={() => go(shiftMonth(month, -1))} aria-label="Previous month">
                <ChevronLeft className="size-4" />
              </Button>
              <span className="w-28 text-center text-sm font-medium">{formatDate(`${month}-01`, { month: 'short', year: 'numeric' })}</span>
              <Button variant="ghost" size="icon" onClick={() => go(shiftMonth(month, 1))} disabled={month >= todayLocal().slice(0, 7)} aria-label="Next month">
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <Button variant="outline" onClick={() => download(`/reports/attendance-register?sectionId=${sectionId}&month=${month}&format=xlsx`, `register-${month}.xlsx`).catch((e) => toast.error(e.message))}>
              <Download className="size-4" /> Excel
            </Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-3 text-[12.5px] text-text-2">
        {Object.entries(ATTENDANCE).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn('inline-flex size-5 items-center justify-center rounded text-[10px] font-bold', v.cell)}>{v.short}</span>
            {v.label}
          </span>
        ))}
      </div>
      <Card className="overflow-hidden">
        {!r ? (
          <Skeleton className="m-4 h-64" />
        ) : r.students.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No students enrolled" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface-2/60">
                  <th className="sticky left-0 z-10 min-w-52 border-b border-border bg-surface-2 px-4 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-text-3">Student</th>
                  {r.days.map((d) => {
                    const day = new Date(`${d}T00:00:00`).getDay();
                    return (
                      <th key={d} className={cn('border-b border-border px-0.5 py-2 text-center text-[11px] font-semibold tabular-nums', day === 0 ? 'text-danger/70' : 'text-text-3')}>
                        {Number(d.slice(8))}
                      </th>
                    );
                  })}
                  <th className="border-b border-border px-3 py-2 text-right text-[12px] font-semibold uppercase text-text-3">%</th>
                </tr>
              </thead>
              <tbody>
                {r.students.map((s) => (
                  <tr key={s.studentId} className="hover:bg-surface-2/40">
                    <td className="sticky left-0 z-10 border-b border-border bg-surface px-4 py-2">
                      <Link href={`/admin/students/${s.studentId}`} className="font-medium hover:text-brand">
                        {s.rollNo ? <span className="mr-2 text-text-3 tabular-nums">{s.rollNo}</span> : null}
                        {s.name}
                      </Link>
                    </td>
                    {r.days.map((d) => {
                      const st = s.days[d] ? CODE[s.days[d]!] : undefined;
                      return (
                        <td key={d} className="border-b border-border p-0.5 text-center">
                          {st ? (
                            <span className={cn('inline-flex size-6 items-center justify-center rounded text-[10px] font-bold', ATTENDANCE[st].cell)} title={`${formatDate(d)}: ${ATTENDANCE[st].label}`}>
                              {ATTENDANCE[st].short}
                            </span>
                          ) : (
                            <span className="text-border-strong">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className={cn('border-b border-border px-3 py-2 text-right font-semibold tabular-nums', (s.percent ?? 100) < 75 ? 'text-danger' : 'text-text')}>{percent(s.percent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

export default function RegisterPage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <RegisterView sectionId={sectionId} />
    </Suspense>
  );
}
