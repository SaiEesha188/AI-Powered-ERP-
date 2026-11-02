'use client';

import { AlertTriangle, BellRing, CalendarDays, CheckCircle2, ClipboardCheck, Clock3, GraduationCap, MessageCircle, Smartphone, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '@/components/app/context';
import { PageHeader } from '@/components/app/page';
import { EVENT_TYPE } from '@/components/app/status';
import { buttonStyles } from '@/components/ui/button';
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, Progress, Skeleton, StatCard } from '@/components/ui/card';
import { cn, formatDate, percent, relativeDay } from '@/lib/cn';
import { useApi } from '@/lib/query';
import type { CalendarEvent } from '@/lib/types';

interface PrincipalDashboard {
  date: string;
  attendance: { sections: number; sectionsMarked: number; sectionsMarkedOnTime: number; present: number; absent: number; late: number; attendancePercent: number | null; cutoffTime: string; notMarked: { sectionId: string; className: string; sectionName: string }[] };
  homeworkToday: { sectionsWithHomework: number; sections: { sectionId: string; className: string; sectionName: string; posted: number }[] };
  pendingApprovals: { holidays: number; circulars: number };
  atRisk: { threshold: number; count: number; students: { studentId: string; name: string; className: string; sectionName: string; percent: number }[] };
  upcomingEvents: CalendarEvent[];
  recentCirculars: { id: string; title: string; publishedAt: string; requiresAck: boolean; recipients: number; read: number; acknowledged: number }[];
}

interface InstituteDashboard {
  enrolment: { total: number; byClass: { className: string; students: number }[] };
  attendanceLast30Days: number | null;
  adoption: { teachers: { total: number; activeLast7Days: number; percent: number | null }; parents: { total: number; activeLast7Days: number; percent: number | null } };
  communication: { reachedPercent: number | null; readPercent: number | null };
  homeworkPostedLast7Days: number;
}

interface AttendanceSummary {
  sections: { sectionId: string; className: string; sectionName: string; closed: string | null; counts: { present: number; absent: number; late: number; halfDay: number; leave: number } | null }[];
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function OverviewPage() {
  const { me, can, term } = useApp();
  const principal = useApi<PrincipalDashboard>(can('attendance.view') ? '/dashboards/principal' : null, { refetchInterval: 60_000 });
  const institute = useApi<InstituteDashboard>(can('students.view') ? '/dashboards/institute' : null);
  const daily = useApi<AttendanceSummary>(principal.data ? `/attendance/reports/daily?date=${principal.data.date}` : null);
  const p = principal.data;
  const a = p?.attendance;

  const chart = (daily.data?.sections ?? [])
    .filter((s) => !s.closed && s.counts)
    .map((s) => ({ name: `${s.className.replace(/^Class\s*/i, '')}-${s.sectionName}`, Present: s.counts!.present + s.counts!.late, Absent: s.counts!.absent, Leave: s.counts!.leave }));

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${me.user.name.split(' ')[0]}`}
        description={p ? `${formatDate(p.date, { weekday: 'long', day: 'numeric', month: 'long' })} · here is how your school is doing today` : 'Loading today’s picture…'}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {a ? (
          <>
            <StatCard label="Attendance today" value={percent(a.attendancePercent)} icon={UserCheck} tone="success" hint={`${a.present + a.late} present · ${a.absent} absent`} />
            <StatCard
              label={`${term.section}s marked`}
              value={`${a.sectionsMarked}/${a.sections}`}
              icon={ClipboardCheck}
              tone="brand"
              hint={`${a.sectionsMarkedOnTime} by ${a.cutoffTime}`}
            />
            <StatCard label={`${term.homework} posted today`} value={`${p.homeworkToday.sectionsWithHomework}/${p.homeworkToday.sections.length}`} icon={GraduationCap} tone="accent" hint={`${term.section}s with ${term.homework.toLowerCase()}`} />
            <StatCard label="Students at risk" value={p.atRisk.count} icon={AlertTriangle} tone={p.atRisk.count ? 'danger' : 'neutral'} hint={`Below ${p.atRisk.threshold}% attendance, last 30 days`} />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[124px] rounded-[var(--radius-card)]" />)
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={`Attendance by ${term.section.toLowerCase()}`}
            description="Present includes late arrivals"
            action={
              <Link href="/admin/attendance" className={buttonStyles({ variant: 'outline', size: 'sm' })}>
                Open register
              </Link>
            }
          />
          <CardBody className="h-72 pt-4">
            {chart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} barGap={2} maxBarSize={44} margin={{ left: -18, right: 4 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 12 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-2)' }}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', fontSize: 13 }}
                  />
                  <Bar dataKey="Present" stackId="a" fill="var(--accent)" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="Leave" stackId="a" fill="var(--brand-2)" />
                  <Bar dataKey="Absent" stackId="a" fill="var(--danger)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={ClipboardCheck} title="No attendance yet today" description="Bars appear as teachers mark their sections." className="py-6" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Not marked yet" description={a ? `${a.notMarked.length} of ${a.sections} ${term.section.toLowerCase()}s` : undefined} />
          <CardBody className="pt-3">
            {!a ? (
              <Skeleton className="h-40" />
            ) : a.notMarked.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">
                <CheckCircle2 className="size-5" /> Every {term.section.toLowerCase()} is marked
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {a.notMarked.slice(0, 7).map((s) => (
                  <li key={s.sectionId} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="font-medium">
                      {s.className} · {s.sectionName}
                    </span>
                    <Badge tone="warning" dot>
                      Pending
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Attendance watch" description="Lowest attendance, last 30 days" />
          <CardBody className="pt-3">
            {!p ? (
              <Skeleton className="h-40" />
            ) : p.atRisk.students.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="No one below the threshold" className="py-6" />
            ) : (
              <ul className="space-y-3">
                {p.atRisk.students.slice(0, 5).map((s) => (
                  <li key={s.studentId}>
                    <Link href={`/admin/students/${s.studentId}`} className="group flex items-center gap-3">
                      <Avatar name={s.name} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium group-hover:text-brand">{s.name}</span>
                        <span className="block text-[12px] text-text-3">
                          {s.className} · {s.sectionName}
                        </span>
                      </span>
                      <span className="w-24">
                        <span className="mb-1 block text-right text-[12px] font-semibold tabular-nums text-danger">{percent(s.percent)}</span>
                        <Progress value={s.percent} tone="danger" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Coming up"
            description="Next 14 days"
            action={
              p && p.pendingApprovals.holidays + p.pendingApprovals.circulars > 0 ? (
                <Badge tone="warning">
                  <Clock3 className="size-3" /> {p.pendingApprovals.holidays + p.pendingApprovals.circulars} awaiting approval
                </Badge>
              ) : undefined
            }
          />
          <CardBody className="pt-3">
            {!p ? (
              <Skeleton className="h-40" />
            ) : p.upcomingEvents.length === 0 ? (
              <EmptyState icon={CalendarDays} title="Nothing scheduled" className="py-6" />
            ) : (
              <ul className="space-y-2.5">
                {p.upcomingEvents.slice(0, 6).map((e) => (
                  <li key={e.id} className="flex items-center gap-3">
                    <span className="flex w-12 shrink-0 flex-col items-center rounded-xl border border-border py-1">
                      <span className="text-[10px] font-semibold uppercase text-text-3">{formatDate(e.startDate, { month: 'short' })}</span>
                      <span className="text-base font-semibold leading-tight">{formatDate(e.startDate, { day: 'numeric' })}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{e.title}</span>
                      <span className="block text-[12px] text-text-3">{relativeDay(e.startDate)}</span>
                    </span>
                    <Badge tone={EVENT_TYPE[e.type]?.tone}>{EVENT_TYPE[e.type]?.label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader title="Recent circulars" description="How many people read and agreed" />
          <CardBody className="pt-3">
            {!p ? (
              <Skeleton className="h-40" />
            ) : p.recentCirculars.length === 0 ? (
              <EmptyState icon={BellRing} title="No circulars yet" className="py-6" />
            ) : (
              <ul className="space-y-4">
                {p.recentCirculars.map((c) => {
                  const read = c.recipients ? (c.read / c.recipients) * 100 : 0;
                  return (
                    <li key={c.id}>
                      <Link href={`/admin/circulars/${c.id}`} className="group block">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm font-medium group-hover:text-brand">{c.title}</span>
                          <span className="shrink-0 text-[12px] tabular-nums text-text-3">
                            {c.read}/{c.recipients} read
                          </span>
                        </div>
                        <Progress value={read} tone="accent" className="mt-1.5" />
                        {c.requiresAck && <p className="mt-1 text-[12px] text-text-3">{c.acknowledged} agreed</p>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {institute.data && (
        <>
          <h2 className="mb-3 mt-10 text-[13px] font-semibold uppercase tracking-wide text-text-3">Adoption this week</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label={`${term.student}s enrolled`} value={institute.data.enrolment.total} icon={GraduationCap} tone="brand" hint={`${percent(institute.data.attendanceLast30Days)} attendance, last 30 days`} />
            <AdoptionCard label="Teachers active" stat={institute.data.adoption.teachers} icon={UserCheck} target={85} />
            <AdoptionCard label="Parents active" stat={institute.data.adoption.parents} icon={Smartphone} target={60} />
            <StatCard
              label="Messages reached"
              value={percent(institute.data.communication.reachedPercent)}
              icon={MessageCircle}
              tone="accent"
              hint={`${percent(institute.data.communication.readPercent)} read on WhatsApp`}
            />
          </div>
        </>
      )}
    </>
  );
}

function AdoptionCard({ label, stat, icon, target }: { label: string; stat: { total: number; activeLast7Days: number; percent: number | null }; icon: typeof UserCheck; target: number }) {
  const value = stat.percent ?? 0;
  return (
    <StatCard
      label={label}
      value={percent(stat.percent)}
      icon={icon}
      tone={value >= target ? 'success' : 'warning'}
      hint={
        <span className="block">
          <span className={cn('block', value >= target ? 'text-success' : 'text-text-3')}>
            {stat.activeLast7Days} of {stat.total} · target {target}%
          </span>
          <Progress value={value} tone={value >= target ? 'success' : 'warning'} className="mt-2" />
        </span>
      }
    />
  );
}
