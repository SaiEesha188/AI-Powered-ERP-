'use client';

import { Award, CalendarCheck2, Medal, TrendingUp } from 'lucide-react';
import { Badge, Progress } from '@/components/ui/card';
import { cn, formatDate, percent } from '@/lib/cn';
import type { ReportCardDetail } from '@/lib/types';

const gradeTone = (grade: string | null) => (!grade ? 'neutral' : grade.startsWith('A') ? 'success' : grade.startsWith('B') ? 'accent' : grade.startsWith('C') ? 'info' : grade === 'D' ? 'warning' : 'danger');

/** One student's report card, used by the office (review) and the parent app (final). */
export function ReportCardView({ card, instituteName, compact }: { card: ReportCardDetail; instituteName?: string; compact?: boolean }) {
  const d = card.data;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="bg-gradient-to-r from-[#1e3a5f] via-[#2b5080] to-[#0f8b80] px-5 py-5 text-white">
        {instituteName && <p className="text-[12px] uppercase tracking-wider text-white/70">{instituteName}</p>}
        <h2 className="mt-0.5 text-lg font-semibold">{card.examName}</h2>
        <p className="text-[13px] text-white/75">
          {formatDate(card.startDate, { day: 'numeric', month: 'short' })} – {formatDate(card.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xl font-semibold">{card.studentName}</p>
            <p className="text-[13px] text-white/75">
              {d.className} · {d.sectionName}
              {d.rollNo ? ` · Roll ${d.rollNo}` : ''} · Adm. {card.admissionNo}
            </p>
          </div>
          <div className="flex gap-3 text-center">
            <Stat label="Overall" value={percent(d.percent)} />
            <Stat label="Grade" value={d.grade ?? '—'} />
            <Stat label="Rank" value={d.rank ? `${d.rank}/${d.sectionSize}` : '—'} />
          </div>
        </div>
      </div>

      <div className="p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-text-3">
              <th className="pb-2">Subject</th>
              <th className="pb-2 text-right">Marks</th>
              {!compact && <th className="pb-2 text-right">%</th>}
              <th className="pb-2 text-right">Grade</th>
              <th className="hidden pb-2 pl-4 sm:table-cell">vs class average</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {d.subjects.map((s) => (
              <tr key={s.subjectId}>
                <td className="py-2.5 font-medium">{s.subject}</td>
                <td className={cn('py-2.5 text-right tabular-nums', s.passed === false && 'text-danger')}>
                  {s.absent ? <span className="text-text-3">Absent</span> : `${s.marks ?? '—'} / ${s.maxMarks}`}
                </td>
                {!compact && <td className="py-2.5 text-right tabular-nums text-text-2">{percent(s.percent)}</td>}
                <td className="py-2.5 text-right">
                  <Badge tone={gradeTone(s.grade)}>{s.grade ?? '—'}</Badge>
                </td>
                <td className="hidden py-2.5 pl-4 sm:table-cell">
                  {s.percent !== null && s.classAverage !== null && (
                    <span className="flex items-center gap-2">
                      <span className="w-28">
                        <Progress value={s.percent} tone={s.percent >= s.classAverage ? 'accent' : 'warning'} />
                      </span>
                      <span className="text-[12px] tabular-nums text-text-3">avg {s.classAverage}%</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td className="pt-3">Total</td>
              <td className="pt-3 text-right tabular-nums">
                {d.totalMarks} / {d.totalMax}
              </td>
              {!compact && <td className="pt-3 text-right tabular-nums">{percent(d.percent)}</td>}
              <td className="pt-3 text-right">
                <Badge tone={gradeTone(d.grade)}>{d.grade ?? '—'}</Badge>
              </td>
              <td className="hidden sm:table-cell" />
            </tr>
          </tfoot>
        </table>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <Tile icon={d.passed ? Award : TrendingUp} label="Result" value={d.passed ? 'Passed' : 'Needs improvement'} tone={d.passed ? 'success' : 'warning'} />
          <Tile icon={Medal} label="Rank in section" value={d.rank ? `${d.rank} of ${d.sectionSize}` : '—'} tone="brand" />
          <Tile icon={CalendarCheck2} label="Attendance" value={percent(d.attendancePercent)} tone="accent" />
        </div>

        <div className="mt-5 rounded-xl bg-surface-2/70 p-4">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-text-3">Class teacher’s remarks</p>
          <p className={cn('mt-1 text-[14px] leading-relaxed', card.remarks ? 'text-text' : 'italic text-text-3')}>{card.remarks ?? 'No remarks yet.'}</p>
        </div>
        {card.publishedAt && <p className="mt-4 text-[12px] text-text-3">Published {formatDate(card.publishedAt)}</p>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-xl bg-white/12 px-3 py-2 ring-1 ring-white/15">
      <span className="block text-[11px] uppercase tracking-wide text-white/70">{label}</span>
      <span className="block text-lg font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function Tile({ icon: Icon, label, value, tone }: { icon: typeof Award; label: string; value: string; tone: 'success' | 'warning' | 'brand' | 'accent' }) {
  const cls = { success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning', brand: 'bg-brand-soft text-brand', accent: 'bg-accent-soft text-accent' }[tone];
  return (
    <div className={cn('rounded-xl p-3', cls)}>
      <Icon className="size-4" />
      <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-[14px] font-semibold leading-tight">{value}</p>
    </div>
  );
}
