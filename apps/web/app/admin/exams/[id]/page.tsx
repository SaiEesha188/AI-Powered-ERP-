'use client';

import { ArrowLeft, CalendarDays, CheckCircle2, Lock, LockOpen, Pencil, Send, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, use, useState } from 'react';
import { useApp } from '@/components/app/context';
import { PageHeader } from '@/components/app/page';
import { EXAM_STATUS } from '@/components/app/status';
import { ReportCardView } from '@/components/app/report-card';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, Progress, Skeleton } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Dialog, Sheet, Tabs } from '@/components/ui/overlay';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { cn, formatDate, percent } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { ExamDetail, ExamPaper, ReportCardDetail, ReportCardRow } from '@/lib/types';

interface Analysis {
  students: number;
  passed: number;
  averagePercent: number | null;
  sections: { section: string; students: number; passed: number; averagePercent: number; topper: number | null; subjects: { subject: string; average: number | null; passed: number; highest: number | null; absent: number }[] }[];
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ExamDetailPage id={id} />
    </Suspense>
  );
}

function ExamDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { can, term, institute } = useApp();
  const exam = useApi<ExamDetail>(`/exams/${id}`, { refetchInterval: 30_000 });
  const [tab, setTab] = useState(useSearchParams().get('tab') ?? 'papers');
  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [confirm, setConfirm] = useState<'schedule' | 'publish' | 'delete' | null>(null);
  const invalidate = ['/exams', '/dashboards'];
  const schedule = useMutate(() => api(`/exams/${id}/schedule`, { method: 'POST' }), { invalidate, success: 'Date sheet published; families are being told' });
  const generate = useMutate(() => api<{ generated: number }>(`/exams/${id}/report-cards/generate`, { method: 'POST' }), { invalidate, success: (r) => `${r.generated} report cards generated`, onSuccess: () => setTab('cards') });
  const publish = useMutate(() => api(`/exams/${id}/report-cards/publish`, { method: 'POST' }), { invalidate, success: 'Results published; families are being notified' });
  const remove = useMutate(() => api(`/exams/${id}`, { method: 'DELETE' }), { invalidate, success: 'Exam deleted', onSuccess: () => router.push('/admin/exams') });
  const unlock = useMutate((sectionId: string) => api(`/exams/${id}/sections/${sectionId}/lock`, { method: 'DELETE' }), { invalidate, success: 'Section reopened' });
  const lock = useMutate((sectionId: string) => api(`/exams/${id}/sections/${sectionId}/lock`, { method: 'POST' }), { invalidate, success: 'Section locked' });

  if (!exam.data) return <Skeleton className="h-96" />;
  const e = exam.data;
  const status = EXAM_STATUS[e.status];
  const allLocked = e.sections.length > 0 && e.sections.every((s) => s.locked);
  const undated = e.papers.filter((p) => !p.date).length;

  return (
    <>
      <Link href="/admin/exams" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-3 hover:text-text">
        <ArrowLeft className="size-4" /> {term.exam}s
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {e.name}
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
          </span>
        }
        description={`${e.assessmentType} · ${formatDate(e.startDate)} – ${formatDate(e.endDate)} · ${status.hint}`}
        actions={
          <>
            {e.status === 'draft' && can('exams.manage') && (
              <>
                <Button variant="ghost" onClick={() => setConfirm('delete')}>
                  <Trash2 className="size-4" /> Delete
                </Button>
                <Button onClick={() => setConfirm('schedule')} disabled={undated > 0} title={undated ? `${undated} papers have no date yet` : undefined}>
                  <CalendarDays className="size-4" /> Publish date sheet
                </Button>
              </>
            )}
            {(e.status === 'scheduled' || e.status === 'locked') && can('report_cards.manage') && (
              <Button variant={e.reportCards.total ? 'outline' : 'primary'} onClick={() => generate.mutate(undefined)} loading={generate.isPending} disabled={!allLocked} title={allLocked ? undefined : 'Every section must be locked first'}>
                <Sparkles className="size-4" /> {e.reportCards.total ? 'Regenerate report cards' : 'Generate report cards'}
              </Button>
            )}
            {e.status === 'locked' && e.reportCards.total > 0 && can('report_cards.publish') && (
              <Button onClick={() => setConfirm('publish')}>
                <Send className="size-4" /> Publish results
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Papers" value={String(e.papers.length)} hint={undated ? `${undated} without a date` : 'All dated'} />
        <Stat label="Sections" value={`${e.sections.filter((s) => s.locked).length}/${e.sections.length}`} hint="locked by class teachers" />
        <Stat label="Marks entered" value={percent(e.sections.reduce((n, s) => n + s.expected, 0) ? (e.sections.reduce((n, s) => n + s.entered, 0) / e.sections.reduce((n, s) => n + s.expected, 0)) * 100 : null)} hint={`${e.sections.reduce((n, s) => n + s.entered, 0)} of ${e.sections.reduce((n, s) => n + s.expected, 0)}`} />
        <Stat label="Report cards" value={`${e.reportCards.published}/${e.reportCards.total}`} hint="published" />
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'papers', label: 'Papers' },
          { value: 'sections', label: 'Marks entry' },
          { value: 'cards', label: 'Report cards' },
          { value: 'analysis', label: 'Analysis' },
        ]}
      />

      <div className="mt-4">
        {tab === 'papers' && (
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>{term.class}</Th>
                  <Th>Subject</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Max</Th>
                  <Th className="text-right">Pass</Th>
                  <Th>Syllabus</Th>
                  {can('exams.manage') && e.status !== 'published' && <Th />}
                </tr>
              </thead>
              <tbody>
                {e.papers.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium">{p.className}</Td>
                    <Td>{p.subjectName}</Td>
                    <Td>{p.date ? formatDate(p.date, { weekday: 'short', day: 'numeric', month: 'short' }) : <Badge tone="warning">No date</Badge>}</Td>
                    <Td className="text-right tabular-nums">{p.maxMarks}</Td>
                    <Td className="text-right tabular-nums">{p.passMarks}</Td>
                    <Td className="max-w-xs truncate text-text-2">{p.syllabusScope ?? '—'}</Td>
                    {can('exams.manage') && e.status !== 'published' && (
                      <Td className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setPaper(p)}>
                          <Pencil className="size-4" /> Edit
                        </Button>
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {tab === 'sections' && (
          <div className="grid gap-4 md:grid-cols-2">
            {e.sections.map((s) => {
              const done = s.expected ? (s.entered / s.expected) * 100 : 0;
              return (
                <Card key={s.id}>
                  <CardHeader
                    title={`${s.className} · ${s.name}`}
                    description={`${s.students} students · ${s.papers} papers`}
                    action={
                      s.locked ? (
                        <Badge tone="success">
                          <Lock className="size-3" /> Locked
                        </Badge>
                      ) : (
                        <Badge tone={done === 100 ? 'warning' : 'neutral'}>{done === 100 ? 'Awaiting lock' : 'In progress'}</Badge>
                      )
                    }
                  />
                  <CardBody className="pt-3">
                    <div className="flex items-center gap-3">
                      <Progress value={done} tone={s.locked ? 'success' : done === 100 ? 'warning' : 'brand'} />
                      <span className="w-20 shrink-0 text-right text-[12.5px] tabular-nums text-text-2">
                        {s.entered}/{s.expected}
                      </span>
                    </div>
                    <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                      {e.papers
                        .filter((p) => p.classId === s.classId)
                        .map((p) => (
                          <li key={p.id}>
                            <Link href={`/admin/exams/${id}/marks?paperId=${p.id}&sectionId=${s.id}`} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-[13px] hover:bg-surface-2">
                              <span className="font-medium">{p.subjectName}</span>
                              <span className="text-text-3">{e.status === 'published' || s.locked ? 'View' : 'Enter'} →</span>
                            </Link>
                          </li>
                        ))}
                    </ul>
                    {e.status !== 'published' && can('report_cards.publish') && (
                      <div className="mt-3 flex justify-end">
                        {s.locked ? (
                          <Button variant="ghost" size="sm" onClick={() => unlock.mutate(s.id)}>
                            <LockOpen className="size-4" /> Reopen for corrections
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => lock.mutate(s.id)} disabled={done < 100}>
                            <Lock className="size-4" /> Lock on class teacher’s behalf
                          </Button>
                        )}
                      </div>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}

        {tab === 'cards' && <ReportCards examId={id} canEdit={e.status !== 'published' && (can('report_cards.manage') || can('report_cards.publish'))} instituteName={institute.name} />}
        {tab === 'analysis' && <AnalysisTab examId={id} />}
      </div>

      {paper && <PaperSheet paper={paper} exam={e} onClose={() => setPaper(null)} />}
      <Dialog
        open={confirm === 'schedule'}
        onOpenChange={() => setConfirm(null)}
        title="Publish the date sheet?"
        description="Families of every class in this exam get the schedule on WhatsApp, and teachers can start entering marks."
        footer={
          <Button onClick={() => (schedule.mutate(undefined), setConfirm(null))} loading={schedule.isPending}>
            Publish date sheet
          </Button>
        }
      >
        <p className="text-sm text-text-2">{e.papers.length} papers across {e.sections.length} sections.</p>
      </Dialog>
      <Dialog
        open={confirm === 'publish'}
        onOpenChange={() => setConfirm(null)}
        title="Publish results to families?"
        description="Every parent gets a WhatsApp link to their child’s report card. Marks cannot change afterwards."
        footer={
          <Button onClick={() => (publish.mutate(undefined), setConfirm(null))} loading={publish.isPending}>
            Publish {e.reportCards.total} report cards
          </Button>
        }
      >
        <p className="text-sm text-text-2">Check remarks in the Report cards tab first; they can’t be edited once published.</p>
      </Dialog>
      <Dialog
        open={confirm === 'delete'}
        onOpenChange={() => setConfirm(null)}
        title="Delete this exam?"
        footer={
          <Button variant="danger" onClick={() => remove.mutate(undefined)} loading={remove.isPending}>
            Delete
          </Button>
        }
      >
        <p className="text-sm text-text-2">Only drafts can be deleted. Papers are removed with it.</p>
      </Dialog>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="p-4">
      <p className="text-[12.5px] font-medium text-text-3">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-[12px] text-text-3">{hint}</p>
    </Card>
  );
}

function PaperSheet({ paper, exam, onClose }: { paper: ExamPaper; exam: ExamDetail; onClose: () => void }) {
  const [form, setForm] = useState({ date: paper.date ?? '', maxMarks: String(paper.maxMarks), passMarks: String(paper.passMarks), syllabusScope: paper.syllabusScope ?? '' });
  const save = useMutate((body: object) => api(`/exams/papers/${paper.id}`, { method: 'PATCH', body }), { invalidate: ['/exams'], success: 'Paper updated', onSuccess: onClose });
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${paper.className} · ${paper.subjectName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate({ date: form.date || null, maxMarks: Number(form.maxMarks), passMarks: Number(form.passMarks), syllabusScope: form.syllabusScope || null })}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" hint={`${formatDate(exam.startDate, { day: 'numeric', month: 'short' })} – ${formatDate(exam.endDate, { day: 'numeric', month: 'short' })}`} className="sm:col-span-2">
          {(id) => <Input id={id} type="date" min={exam.startDate} max={exam.endDate} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />}
        </Field>
        <Field label="Maximum marks">{(id) => <Input id={id} inputMode="numeric" value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} />}</Field>
        <Field label="Pass marks">{(id) => <Input id={id} inputMode="numeric" value={form.passMarks} onChange={(e) => setForm({ ...form, passMarks: e.target.value })} />}</Field>
        <Field label="Syllabus" hint="Shown to families with the date sheet" className="sm:col-span-2">
          {(id) => <Textarea id={id} placeholder="Chapters 1 to 5" value={form.syllabusScope} onChange={(e) => setForm({ ...form, syllabusScope: e.target.value })} />}
        </Field>
      </div>
    </Sheet>
  );
}

function ReportCards({ examId, canEdit, instituteName }: { examId: string; canEdit: boolean; instituteName: string }) {
  const cards = useApi<ReportCardRow[]>(`/exams/${examId}/report-cards`);
  const [openId, setOpenId] = useState<string | null>(null);
  if (cards.isLoading) return <Skeleton className="h-64" />;
  if (!cards.data?.length) return <Card><EmptyState icon={Sparkles} title="No report cards yet" description="Lock every section, then generate report cards from the button above." /></Card>;
  return (
    <>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Student</Th>
              <Th>Section</Th>
              <Th className="text-right">Rank</Th>
              <Th className="text-right">%</Th>
              <Th>Grade</Th>
              <Th>Result</Th>
              <Th>Remarks</Th>
            </tr>
          </thead>
          <tbody>
            {cards.data.map((c) => (
              <Tr key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)}>
                <Td>
                  <span className="flex items-center gap-3 font-medium">
                    <Avatar name={c.name} size={30} /> {c.name}
                  </span>
                </Td>
                <Td className="text-text-2">
                  {c.className} · {c.sectionName}
                </Td>
                <Td className="text-right tabular-nums">{c.rank ?? '—'}</Td>
                <Td className="text-right tabular-nums">{percent(c.percent)}</Td>
                <Td>
                  <Badge tone={c.grade?.startsWith('A') ? 'success' : c.grade === 'E' ? 'danger' : 'brand'}>{c.grade ?? '—'}</Badge>
                </Td>
                <Td>{c.passed ? <Badge tone="success">Passed</Badge> : <Badge tone="danger">Failed</Badge>}</Td>
                <Td>{c.hasRemarks ? <CheckCircle2 className="size-4 text-success" aria-label="Has remarks" /> : <span className="text-[12px] text-warning">Missing</span>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {openId && <ReportCardSheet id={openId} canEdit={canEdit} instituteName={instituteName} onClose={() => setOpenId(null)} />}
    </>
  );
}

function ReportCardSheet({ id, canEdit, instituteName, onClose }: { id: string; canEdit: boolean; instituteName: string; onClose: () => void }) {
  const card = useApi<ReportCardDetail>(`/report-cards/${id}`);
  const [remarks, setRemarks] = useState<string | null>(null);
  const save = useMutate((body: object) => api(`/report-cards/${id}/remarks`, { method: 'PATCH', body }), { invalidate: ['/report-cards', '/exams'], success: 'Remarks saved' });
  const value = remarks ?? card.data?.remarks ?? '';
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={card.data?.studentName ?? 'Report card'} width="max-w-3xl">
      {!card.data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-4">
          <ReportCardView card={{ ...card.data, remarks: value || null }} instituteName={instituteName} />
          {canEdit && card.data.status !== 'published' && (
            <div className="space-y-2">
              <Field label="Class teacher’s remarks" hint="Shown to the family on the report card">
                {(fid) => <Textarea id={fid} value={value} onChange={(e) => setRemarks(e.target.value)} />}
              </Field>
              <div className="flex justify-end">
                <Button onClick={() => save.mutate({ remarks: value || null })} loading={save.isPending} disabled={remarks === null || remarks === (card.data?.remarks ?? '')}>
                  Save remarks
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function AnalysisTab({ examId }: { examId: string }) {
  const a = useApi<Analysis>(`/exams/${examId}/analysis`);
  if (a.isLoading) return <Skeleton className="h-64" />;
  if (!a.data?.students) return <Card><EmptyState icon={Sparkles} title="Nothing to analyse yet" description="Generate report cards first." /></Card>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Stat label="Students" value={String(a.data.students)} hint="with report cards" />
        <Stat label="Pass rate" value={percent((a.data.passed / a.data.students) * 100)} hint={`${a.data.passed} passed`} />
        <Stat label="Average" value={percent(a.data.averagePercent)} hint="across all sections" />
      </div>
      {a.data.sections.map((s) => (
        <Card key={s.section}>
          <CardHeader title={s.section} description={`${s.passed} of ${s.students} passed · average ${percent(s.averagePercent)} · best ${percent(s.topper)}`} />
          <CardBody className="pt-3">
            <ul className="space-y-2.5">
              {s.subjects.map((sub) => (
                <li key={sub.subject} className="grid grid-cols-[8rem_1fr_6rem] items-center gap-3 text-sm">
                  <span className="truncate font-medium">{sub.subject}</span>
                  <Progress value={sub.average ?? 0} tone={(sub.average ?? 0) >= 60 ? 'accent' : (sub.average ?? 0) >= 40 ? 'warning' : 'danger'} />
                  <span className={cn('text-right text-[12.5px] tabular-nums text-text-2')}>
                    {percent(sub.average)} · {sub.passed}/{s.students}
                    {sub.absent ? ` · ${sub.absent} ab` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
