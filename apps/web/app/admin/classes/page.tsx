'use client';

import { BookMarked, Layers, Pencil, Plus, UserRound, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useApp } from '@/components/app/context';
import { PageHeader } from '@/components/app/page';
import { useSections } from '@/components/app/pickers';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useApi, useMutate } from '@/lib/query';
import type { ClassRow, SectionRow, StaffRow, Subject } from '@/lib/types';

export default function ClassesPage() {
  const { can, term } = useApp();
  const classes = useApi<ClassRow[]>('/classes');
  const sections = useSections();
  const subjects = useApi<Subject[]>('/subjects');
  const manage = can('academics.manage');
  const [dialog, setDialog] = useState<null | { kind: 'class' } | { kind: 'subject' } | { kind: 'section'; classId: string } | { kind: 'subjects'; cls: ClassRow } | { kind: 'assign'; section: SectionRow }>(null);
  const close = () => setDialog(null);

  return (
    <>
      <PageHeader
        title={`${term.class}es & subjects`}
        description={`${term.class}es, their ${term.section.toLowerCase()}s this year, and who teaches what`}
        actions={
          manage && (
            <>
              <Button variant="outline" onClick={() => setDialog({ kind: 'subject' })}>
                <BookMarked className="size-4" /> New subject
              </Button>
              <Button onClick={() => setDialog({ kind: 'class' })}>
                <Plus className="size-4" /> New {term.class.toLowerCase()}
              </Button>
            </>
          )
        }
      />

      {classes.isLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : !classes.data?.length ? (
        <Card>
          <EmptyState icon={Layers} title={`No ${term.class.toLowerCase()}es yet`} description={`Create ${term.class.toLowerCase()}es, then add ${term.section.toLowerCase()}s and subjects to each.`} />
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {classes.data.map((cls) => {
            const own = (sections.data ?? []).filter((s) => s.classId === cls.id);
            return (
              <Card key={cls.id}>
                <CardHeader
                  title={cls.name}
                  description={`${own.length} ${term.section.toLowerCase()}${own.length === 1 ? '' : 's'} · ${cls.subjects.length} subjects`}
                  action={
                    manage && (
                      <Button variant="outline" size="sm" onClick={() => setDialog({ kind: 'section', classId: cls.id })}>
                        <Plus className="size-4" /> {term.section}
                      </Button>
                    )
                  }
                />
                <CardBody className="space-y-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {cls.subjects.length ? (
                      cls.subjects.map((s) => (
                        <Badge key={s.id} tone="brand">
                          {s.name}
                          {s.periodsPerWeek ? <span className="text-brand/60"> · {s.periodsPerWeek}/wk</span> : null}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-[13px] text-text-3">No subjects yet</span>
                    )}
                    {manage && (
                      <button className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium text-text-3 hover:bg-surface-2 hover:text-text" onClick={() => setDialog({ kind: 'subjects', cls })}>
                        <Pencil className="size-3" /> Edit
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {own.map((sec) => (
                      <div key={sec.id} className="rounded-xl border border-border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-accent-soft text-[15px] font-semibold text-accent">{sec.name}</span>
                            <div>
                              <p className="text-sm font-semibold">
                                {cls.name} · {sec.name}
                              </p>
                              <p className="flex items-center gap-1.5 text-[12.5px] text-text-3">
                                <UserRound className="size-3.5" /> {sec.classTeacher ? `${sec.classTeacher.name} (class teacher)` : 'No class teacher'}
                              </p>
                            </div>
                          </div>
                          {manage && (
                            <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'assign', section: sec })}>
                              Assign
                            </Button>
                          )}
                        </div>
                        {sec.assignments.length > 0 && (
                          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                            {sec.assignments.map((a) => (
                              <li key={a.id} className="flex items-center gap-2 rounded-lg bg-surface-2/70 px-2.5 py-1.5 text-[12.5px]">
                                <Avatar name={a.staffName} size={22} />
                                <span className="font-medium">{a.subjectName}</span>
                                <span className="truncate text-text-3">{a.staffName}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                    {own.length === 0 && <p className="text-[13px] text-text-3">No {term.section.toLowerCase()}s this year.</p>}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {dialog?.kind === 'class' && <NewClassDialog onClose={close} />}
      {dialog?.kind === 'subject' && <NewSubjectDialog onClose={close} />}
      {dialog?.kind === 'section' && <NewSectionDialog classId={dialog.classId} onClose={close} />}
      {dialog?.kind === 'subjects' && <ClassSubjectsDialog cls={dialog.cls} subjects={subjects.data ?? []} onClose={close} />}
      {dialog?.kind === 'assign' && <AssignDialog section={dialog.section} subjects={(classes.data ?? []).find((c) => c.id === dialog.section.classId)?.subjects ?? []} onClose={close} />}
    </>
  );
}

function NewClassDialog({ onClose }: { onClose: () => void }) {
  const { term } = useApp();
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const create = useMutate((body: object) => api('/classes', { method: 'POST', body }), { invalidate: ['/classes'], success: `${term.class} created`, onSuccess: onClose });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`New ${term.class.toLowerCase()}`}
      footer={
        <Button type="submit" form="class-form" loading={create.isPending}>
          Create
        </Button>
      }
    >
      <form id="class-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e: FormEvent) => (e.preventDefault(), create.mutate({ name, level: Number(level) }))}>
        <Field label="Name">{(id) => <Input id={id} placeholder="Class 9" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />}</Field>
        <Field label="Level" hint="For ordering and promotion: Class 9 = 9">
          {(id) => <Input id={id} inputMode="numeric" value={level} onChange={(e) => setLevel(e.target.value)} required />}
        </Field>
      </form>
    </Dialog>
  );
}

function NewSubjectDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: '', code: '', type: 'scholastic' });
  const create = useMutate((body: object) => api('/subjects', { method: 'POST', body }), { invalidate: ['/subjects', '/classes'], success: 'Subject created', onSuccess: onClose });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New subject"
      footer={
        <Button type="submit" form="subject-form" loading={create.isPending}>
          Create
        </Button>
      }
    >
      <form id="subject-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e: FormEvent) => (e.preventDefault(), create.mutate(form))}>
        <Field label="Name">{(id) => <Input id={id} placeholder="Mathematics" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />}</Field>
        <Field label="Code">{(id) => <Input id={id} placeholder="MATH" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required />}</Field>
        <Field label="Type" className="sm:col-span-2">
          {(id) => (
            <Select id={id} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="scholastic">Scholastic</option>
              <option value="co_scholastic">Co-scholastic</option>
              <option value="elective">Elective</option>
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}

function NewSectionDialog({ classId, onClose }: { classId: string; onClose: () => void }) {
  const { term } = useApp();
  const staff = useApi<StaffRow[]>('/staff');
  const [name, setName] = useState('');
  const [teacher, setTeacher] = useState('');
  const create = useMutate((body: object) => api('/sections', { method: 'POST', body }), { invalidate: ['/sections'], success: `${term.section} created`, onSuccess: onClose });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`New ${term.section.toLowerCase()}`}
      description="Created in the current academic year"
      footer={
        <Button type="submit" form="section-form" loading={create.isPending}>
          Create
        </Button>
      }
    >
      <form id="section-form" className="grid gap-4" onSubmit={(e: FormEvent) => (e.preventDefault(), create.mutate({ classId, name, classTeacherId: teacher || null }))}>
        <Field label="Name">{(id) => <Input id={id} placeholder="A" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />}</Field>
        <Field label="Class teacher">
          {(id) => (
            <Select id={id} value={teacher} onChange={(e) => setTeacher(e.target.value)}>
              <option value="">Assign later</option>
              {(staff.data ?? [])
                .filter((s) => s.status === 'active')
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}

function ClassSubjectsDialog({ cls, subjects, onClose }: { cls: ClassRow; subjects: Subject[]; onClose: () => void }) {
  const [chosen, setChosen] = useState<Record<string, string>>(Object.fromEntries(cls.subjects.map((s) => [s.id, s.periodsPerWeek ? String(s.periodsPerWeek) : ''])));
  const save = useMutate((body: object) => api(`/classes/${cls.id}/subjects`, { method: 'PUT', body }), { invalidate: ['/classes'], success: 'Subjects updated', onSuccess: onClose });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Subjects for ${cls.name}`}
      footer={
        <Button loading={save.isPending} onClick={() => save.mutate({ subjects: Object.entries(chosen).map(([subjectId, p]) => ({ subjectId, periodsPerWeek: p ? Number(p) : null })) })}>
          Save
        </Button>
      }
    >
      {subjects.length === 0 ? (
        <p className="text-sm text-text-3">Create subjects first.</p>
      ) : (
        <ul className="divide-y divide-border">
          {subjects.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1">
                <Checkbox
                  label={s.name}
                  description={s.code}
                  checked={s.id in chosen}
                  onChange={(e) =>
                    setChosen((c) => {
                      const next = { ...c };
                      if (e.target.checked) next[s.id] = '';
                      else delete next[s.id];
                      return next;
                    })
                  }
                />
              </div>
              {s.id in chosen && (
                <Input className="w-24" inputMode="numeric" placeholder="Periods" aria-label={`${s.name} periods per week`} value={chosen[s.id]} onChange={(e) => setChosen((c) => ({ ...c, [s.id]: e.target.value }))} />
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function AssignDialog({ section: opened, subjects, onClose }: { section: SectionRow; subjects: ClassRow['subjects']; onClose: () => void }) {
  const staff = useApi<StaffRow[]>('/staff');
  // Read the live row so changes made here show up immediately.
  const section = useSections().data?.find((s) => s.id === opened.id) ?? opened;
  const active = (staff.data ?? []).filter((s) => s.status === 'active');
  const [classTeacher, setClassTeacher] = useState(section.classTeacherId ?? '');
  const [subjectId, setSubjectId] = useState('');
  const [staffId, setStaffId] = useState('');
  const updateCT = useMutate((id: string) => api(`/sections/${section.id}`, { method: 'PATCH', body: { classTeacherId: id || null } }), { invalidate: ['/sections'], success: 'Class teacher updated' });
  const assign = useMutate(() => api(`/sections/${section.id}/assignments`, { method: 'POST', body: { staffId, subjectId } }), {
    invalidate: ['/sections'],
    success: 'Teacher assigned',
    onSuccess: () => (setSubjectId(''), setStaffId('')),
  });
  const unassign = useMutate((id: string) => api(`/sections/${section.id}/assignments/${id}`, { method: 'DELETE' }), { invalidate: ['/sections'], success: 'Assignment removed' });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${section.className} · ${section.name}`} description="Class teacher and subject teachers">
      <div className="space-y-6">
        <div className="flex items-end gap-2">
          <Field label="Class teacher" className="flex-1">
            {(id) => (
              <Select id={id} value={classTeacher} onChange={(e) => setClassTeacher(e.target.value)}>
                <option value="">None</option>
                {active.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button variant="outline" onClick={() => updateCT.mutate(classTeacher)} loading={updateCT.isPending} disabled={classTeacher === (section.classTeacherId ?? '')}>
            Save
          </Button>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-text-2">Subject teachers</p>
          <ul className="space-y-1.5">
            {section.assignments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                <span className="w-28 font-medium">{a.subjectName}</span>
                <span className="flex-1 text-text-2">{a.staffName}</span>
                <button className="rounded-lg p-1 text-text-3 hover:bg-danger-soft hover:text-danger" onClick={() => unassign.mutate(a.id)} aria-label={`Remove ${a.staffName} from ${a.subjectName}`}>
                  <X className="size-4" />
                </button>
              </li>
            ))}
            {section.assignments.length === 0 && <li className="text-[13px] text-text-3">No subject teachers yet.</li>}
          </ul>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Subject">
              <option value="">Subject…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Teacher">
              <option value="">Teacher…</option>
              {active.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Button onClick={() => assign.mutate(undefined)} disabled={!subjectId || !staffId} loading={assign.isPending}>
              Add
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
