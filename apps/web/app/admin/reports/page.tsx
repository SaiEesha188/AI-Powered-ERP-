'use client';

import { BookOpen, ClipboardList, FileDown, FileSpreadsheet, MessagesSquare, TriangleAlert, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useApp } from '@/components/app/context';
import { PageHeader } from '@/components/app/page';
import { SectionSelect } from '@/components/app/pickers';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { download } from '@/lib/api';
import { addDays, todayLocal } from '@/lib/cn';

interface ReportDef {
  key: string;
  title: string;
  description: string;
  icon: typeof Users;
  needs: string;
  fields: ('section' | 'month' | 'range' | 'threshold')[];
  path: (v: Values) => string;
  requireSection?: boolean;
}

interface Values {
  sectionId: string;
  month: string;
  from: string;
  to: string;
  threshold: string;
}

const REPORTS: ReportDef[] = [
  {
    key: 'register',
    title: 'Monthly attendance register',
    description: 'One row per student, one column per day, with totals.',
    icon: ClipboardList,
    needs: 'attendance.view',
    fields: ['section', 'month'],
    requireSection: true,
    path: (v) => `/reports/attendance-register?sectionId=${v.sectionId}&month=${v.month}`,
  },
  {
    key: 'defaulters',
    title: 'Attendance below threshold',
    description: 'Students under the attendance cut-off in a date range.',
    icon: TriangleAlert,
    needs: 'attendance.view',
    fields: ['range', 'threshold', 'section'],
    path: (v) => `/reports/attendance-defaulters?from=${v.from}&to=${v.to}&threshold=${v.threshold}${v.sectionId ? `&sectionId=${v.sectionId}` : ''}`,
  },
  {
    key: 'students',
    title: 'Student list with guardians',
    description: 'Current enrolment with roll numbers and parent contacts.',
    icon: Users,
    needs: 'students.view',
    fields: ['section'],
    path: (v) => `/reports/students?${v.sectionId ? `sectionId=${v.sectionId}` : ''}`,
  },
  {
    key: 'homework',
    title: 'Homework posted and completed',
    description: 'Per section: how much homework was set and done.',
    icon: BookOpen,
    needs: 'homework.view',
    fields: ['range'],
    path: (v) => `/reports/homework?from=${v.from}&to=${v.to}`,
  },
  {
    key: 'reach',
    title: 'Communication reach',
    description: 'Messages sent, delivered, read and failed, by type.',
    icon: MessagesSquare,
    needs: 'comms.view',
    fields: ['month'],
    path: (v) => `/reports/communication-reach?month=${v.month}`,
  },
];

export default function ReportsPage() {
  const { can } = useApp();
  const today = todayLocal();
  return (
    <>
      <PageHeader title="Reports" description="Download standard reports as Excel or CSV. Every download is recorded in the audit log." />
      <div className="grid gap-4 lg:grid-cols-2">
        {REPORTS.filter((r) => can(r.needs)).map((r) => (
          <ReportCard key={r.key} report={r} initial={{ sectionId: '', month: today.slice(0, 7), from: addDays(today, -30), to: today, threshold: '75' }} />
        ))}
      </div>
    </>
  );
}

function ReportCard({ report, initial }: { report: ReportDef; initial: Values }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState<string>();
  const missing = report.requireSection && !v.sectionId;

  async function get(format: 'xlsx' | 'csv') {
    setBusy(format);
    const base = report.path(v);
    await download(`${base}${base.includes('?') ? '&' : '?'}format=${format}`, `${report.key}-${v.month || v.to}.${format}`).catch((e: Error) => toast.error(e.message));
    setBusy(undefined);
  }

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <report.icon className="size-5" />
        </span>
        <div>
          <h3 className="text-[15px] font-semibold">{report.title}</h3>
          <p className="mt-0.5 text-[13px] text-text-3">{report.description}</p>
        </div>
      </div>
      <div className="mt-4 grid flex-1 gap-3 sm:grid-cols-2">
        {report.fields.includes('section') && (
          <Field label="Section">{(id) => <SectionSelect id={id} value={v.sectionId} onChange={(sectionId) => setV({ ...v, sectionId })} allLabel={report.requireSection ? undefined : 'All sections'} />}</Field>
        )}
        {report.fields.includes('month') && <Field label="Month">{(id) => <Input id={id} type="month" value={v.month} onChange={(e) => setV({ ...v, month: e.target.value })} />}</Field>}
        {report.fields.includes('range') && (
          <>
            <Field label="From">{(id) => <Input id={id} type="date" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} />}</Field>
            <Field label="To">{(id) => <Input id={id} type="date" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} />}</Field>
          </>
        )}
        {report.fields.includes('threshold') && <Field label="Below (%)">{(id) => <Input id={id} inputMode="numeric" value={v.threshold} onChange={(e) => setV({ ...v, threshold: e.target.value })} />}</Field>}
      </div>
      <div className="mt-5 flex gap-2 border-t border-border pt-4">
        <Button onClick={() => get('xlsx')} loading={busy === 'xlsx'} disabled={missing}>
          <FileSpreadsheet className="size-4" /> Excel
        </Button>
        <Button variant="outline" onClick={() => get('csv')} loading={busy === 'csv'} disabled={missing}>
          <FileDown className="size-4" /> CSV
        </Button>
      </div>
    </Card>
  );
}
