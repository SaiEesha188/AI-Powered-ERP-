'use client';

import { ClipboardPen, Plus, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import { useApp } from '@/components/app/context';
import { EXAM_STATUS } from '@/components/app/status';
import { PageHeader } from '@/components/app/page';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, CardHeader, EmptyState, Progress, Skeleton } from '@/components/ui/card';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Sheet, Tabs } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { AssessmentType, ClassRow, ExamRow, GradeScale } from '@/lib/types';


export default function ExamsPage() {
  const { can, term } = useApp();
  const [tab, setTab] = useState('exams');
  return (
    <>
      <PageHeader title={`${term.exam}s & report cards`} description="Set up exams, follow marks entry, and publish report cards to families." />
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'exams', label: `${term.exam}s` },
          { value: 'grading', label: 'Grading' },
        ]}
      />
      <div className="mt-4">{tab === 'exams' ? <ExamsList canManage={can('exams.manage')} /> : <GradingSettings />}</div>
    </>
  );
}

function ExamsList({ canManage }: { canManage: boolean }) {
  const { term } = useApp();
  const exams = useApi<ExamRow[]>('/exams');
  const [open, setOpen] = useState(false);
  return (
    <>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New {term.exam.toLowerCase()}
          </Button>
        </div>
      )}
      {exams.isLoading ? (
        <Skeleton className="h-48" />
      ) : !exams.data?.length ? (
        <Card>
          <EmptyState icon={ClipboardPen} title={`No ${term.exam.toLowerCase()}s yet`} description="Create one and papers are set up for every subject of the chosen classes." action={canManage ? <Button onClick={() => setOpen(true)}>Create the first</Button> : undefined} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {exams.data.map((e) => {
            const s = EXAM_STATUS[e.status];
            return (
              <Link key={e.id} href={`/admin/exams/${e.id}`}>
                <Card className="h-full p-5 transition-shadow hover:shadow-pop">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Badge tone={s.tone} dot>
                        {s.label}
                      </Badge>
                      <h3 className="mt-2 truncate text-[16px] font-semibold">{e.name}</h3>
                      <p className="text-[13px] text-text-3">
                        {e.assessmentType} · {formatDate(e.startDate, { day: 'numeric', month: 'short' })} – {formatDate(e.endDate, { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {e.classes.map((c) => (
                      <Badge key={c.id}>{c.name}</Badge>
                    ))}
                    <span className="ml-auto text-[12px] text-text-3">{e.papers} papers</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      {open && <NewExamSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function NewExamSheet({ onClose }: { onClose: () => void }) {
  const { term } = useApp();
  const types = useApi<AssessmentType[]>('/exams/assessment-types');
  const classes = useApi<ClassRow[]>('/classes');
  const [form, setForm] = useState({ name: '', assessmentTypeId: '', startDate: '', endDate: '', defaultMaxMarks: '100', defaultPassMarks: '33' });
  const [classIds, setClassIds] = useState<string[]>([]);
  const create = useMutate((body: object) => api<{ id: string }>('/exams', { method: 'POST', body }), { invalidate: ['/exams'], success: 'Exam created with a paper per subject', onSuccess: onClose });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate({ ...form, defaultMaxMarks: Number(form.defaultMaxMarks), defaultPassMarks: Number(form.defaultPassMarks), classIds });
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`New ${term.exam.toLowerCase()}`}
      description="Papers are created for every subject of each class. You can change dates and marks per paper afterwards."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="exam-form" loading={create.isPending} disabled={!classIds.length}>
            Create
          </Button>
        </>
      }
    >
      <form id="exam-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">{(id) => <Input id={id} placeholder="Mid-term 2026" value={form.name} onChange={set('name')} required autoFocus />}</Field>
        <Field label="Type">
          {(id) => (
            <Select id={id} value={form.assessmentTypeId} onChange={set('assessmentTypeId')} required>
              <option value="">Choose…</option>
              {(types.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.weightage}%)
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div />
        <Field label="From">{(id) => <Input id={id} type="date" value={form.startDate} onChange={set('startDate')} required />}</Field>
        <Field label="To">{(id) => <Input id={id} type="date" value={form.endDate} min={form.startDate} onChange={set('endDate')} required />}</Field>
        <Field label="Max marks per paper">{(id) => <Input id={id} inputMode="numeric" value={form.defaultMaxMarks} onChange={set('defaultMaxMarks')} required />}</Field>
        <Field label="Pass marks">{(id) => <Input id={id} inputMode="numeric" value={form.defaultPassMarks} onChange={set('defaultPassMarks')} required />}</Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-[13px] font-medium text-text-2">{term.class}es</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(classes.data ?? []).map((c) => (
              <Checkbox key={c.id} label={c.name} description={`${c.subjects.length} subjects`} checked={classIds.includes(c.id)} onChange={(e) => setClassIds((l) => (e.target.checked ? [...l, c.id] : l.filter((x) => x !== c.id)))} />
            ))}
          </div>
        </fieldset>
      </form>
    </Sheet>
  );
}

function GradingSettings() {
  const { can } = useApp();
  const types = useApi<AssessmentType[]>('/exams/assessment-types');
  const scales = useApi<GradeScale[]>('/exams/grade-scales');
  const editable = can('institute.settings.manage');
  const total = (types.data ?? []).reduce((n, t) => n + t.weightage, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Assessment types" description="How each kind of exam counts towards the term result" action={<Badge tone={total === 100 ? 'success' : 'warning'}>{total}% total</Badge>} />
        <CardBody className="space-y-3 pt-3">
          {(types.data ?? []).map((t) => (
            <AssessmentTypeRow key={t.id} type={t} editable={can('exams.manage')} />
          ))}
          {can('exams.manage') && <NewTypeRow />}
          <div className="pt-1">
            <Progress value={Math.min(100, total)} tone={total === 100 ? 'success' : 'warning'} />
          </div>
        </CardBody>
      </Card>
      {(scales.data ?? []).map((s) => (
        <GradeScaleCard key={s.id} scale={s} editable={editable} />
      ))}
    </div>
  );
}

function AssessmentTypeRow({ type, editable }: { type: AssessmentType; editable: boolean }) {
  const [form, setForm] = useState({ name: type.name, weightage: String(type.weightage) });
  useEffect(() => setForm({ name: type.name, weightage: String(type.weightage) }), [type]);
  const save = useMutate((body: object) => api(`/exams/assessment-types/${type.id}`, { method: 'PUT', body }), { invalidate: ['/exams/assessment-types'], success: 'Saved' });
  const remove = useMutate(() => api(`/exams/assessment-types/${type.id}`, { method: 'DELETE' }), { invalidate: ['/exams/assessment-types'], success: 'Removed' });
  const dirty = form.name !== type.name || Number(form.weightage) !== type.weightage;
  return (
    <div className="flex items-center gap-2">
      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!editable} className="flex-1" aria-label="Name" />
      <div className="relative w-24">
        <Input inputMode="decimal" value={form.weightage} onChange={(e) => setForm({ ...form, weightage: e.target.value })} disabled={!editable} className="pr-7 text-right" aria-label="Weightage" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-text-3">%</span>
      </div>
      {editable && (
        <>
          <Button variant="ghost" size="icon" onClick={() => save.mutate({ name: form.name, weightage: Number(form.weightage), seq: type.seq })} disabled={!dirty} loading={save.isPending} aria-label="Save">
            <Save className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => remove.mutate(undefined)} aria-label="Delete">
            <Trash2 className="size-4 text-danger" />
          </Button>
        </>
      )}
    </div>
  );
}

function NewTypeRow() {
  const [form, setForm] = useState({ name: '', weightage: '' });
  const create = useMutate((body: object) => api('/exams/assessment-types', { method: 'POST', body }), { invalidate: ['/exams/assessment-types'], success: 'Added', onSuccess: () => setForm({ name: '', weightage: '' }) });
  return (
    <div className="flex items-center gap-2 border-t border-border pt-3">
      <Input placeholder="New type, e.g. Practical" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="flex-1" aria-label="New type name" />
      <div className="relative w-24">
        <Input inputMode="decimal" placeholder="0" value={form.weightage} onChange={(e) => setForm({ ...form, weightage: e.target.value })} className="pr-7 text-right" aria-label="New type weightage" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-text-3">%</span>
      </div>
      <Button variant="outline" onClick={() => create.mutate({ name: form.name, weightage: Number(form.weightage), seq: 99 })} disabled={form.name.length < 2 || form.weightage === ''} loading={create.isPending}>
        Add
      </Button>
    </div>
  );
}

function GradeScaleCard({ scale, editable }: { scale: GradeScale; editable: boolean }) {
  const [bands, setBands] = useState(scale.bands.map((b) => ({ ...b, minPct: String(b.minPct), maxPct: String(b.maxPct), points: b.points === null ? '' : String(b.points), description: b.description ?? '' })));
  useEffect(() => setBands(scale.bands.map((b) => ({ ...b, minPct: String(b.minPct), maxPct: String(b.maxPct), points: b.points === null ? '' : String(b.points), description: b.description ?? '' }))), [scale]);
  const save = useMutate(
    (body: object) => api(`/exams/grade-scales/${scale.id}`, { method: 'PUT', body }),
    { invalidate: ['/exams/grade-scales'], success: 'Grade scale saved' },
  );
  const update = (i: number, patch: Partial<(typeof bands)[number]>) => setBands((l) => l.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <Card>
      <CardHeader title={scale.name} description="Percentage bands, highest first" action={scale.isDefault ? <Badge tone="brand">Default</Badge> : undefined} />
      <CardBody className="pt-3">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.6fr] gap-2 text-[11px] font-semibold uppercase tracking-wide text-text-3">
          <span>Grade</span>
          <span>From %</span>
          <span>To %</span>
          <span>Points</span>
          <span>Means</span>
        </div>
        <div className="mt-2 space-y-2">
          {bands.map((b, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_1.6fr] gap-2">
              <Input value={b.grade} onChange={(e) => update(i, { grade: e.target.value })} disabled={!editable} aria-label="Grade" className="h-9 font-semibold" />
              <Input inputMode="decimal" value={b.minPct} onChange={(e) => update(i, { minPct: e.target.value })} disabled={!editable} aria-label="From" className="h-9" />
              <Input inputMode="decimal" value={b.maxPct} onChange={(e) => update(i, { maxPct: e.target.value })} disabled={!editable} aria-label="To" className="h-9" />
              <Input inputMode="decimal" value={b.points} onChange={(e) => update(i, { points: e.target.value })} disabled={!editable} aria-label="Points" className="h-9" />
              <Input value={b.description} onChange={(e) => update(i, { description: e.target.value })} disabled={!editable} aria-label="Description" className="h-9" />
            </div>
          ))}
        </div>
        {editable && (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setBands((l) => [...l, { grade: '', minPct: '0', maxPct: '0', points: '', description: '' }])}>
              <Plus className="size-4" /> Band
            </Button>
            <Button size="sm" loading={save.isPending} onClick={() => save.mutate({ name: scale.name, bands: bands.map((b) => ({ grade: b.grade, minPct: Number(b.minPct), maxPct: Number(b.maxPct), points: b.points === '' ? null : Number(b.points), description: b.description || null })) })}>
              <Save className="size-4" /> Save scale
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
