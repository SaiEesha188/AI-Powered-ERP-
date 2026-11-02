'use client';

import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, GraduationCap, Plus, Trash2, Upload, UserPlus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { type FormEvent, useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { useApp } from '@/components/app/context';
import { PageHeader } from '@/components/app/page';
import { SearchInput, SectionSelect } from '@/components/app/pickers';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Dialog, Sheet } from '@/components/ui/overlay';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api, apiRaw, download } from '@/lib/api';
import { useApi, useMutate } from '@/lib/query';
import type { StudentRow } from '@/lib/types';

export default function StudentsPage() {
  const { can, term } = useApp();
  const [q, setQ] = useState('');
  const [sectionId, setSectionId] = useState('');
  const query = useDeferredValue(q.trim());
  const params = new URLSearchParams({ limit: '500' });
  if (query) params.set('q', query);
  if (sectionId) params.set('sectionId', sectionId);
  const students = useApi<StudentRow[]>(`/students?${params}`);
  const [admitOpen, setAdmitOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <PageHeader
        title={`${term.student}s`}
        description={students.data ? `${students.data.length} ${students.data.length === 1 ? term.student.toLowerCase() : `${term.student.toLowerCase()}s`}${sectionId || query ? ' match' : ' this year'}` : ' '}
        actions={
          can('students.manage') && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" /> Import
              </Button>
              <Button onClick={() => setAdmitOpen(true)}>
                <UserPlus className="size-4" /> Admit {term.student.toLowerCase()}
              </Button>
            </>
          )
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or admission number" className="sm:max-w-sm sm:flex-1" aria-label="Search students" />
          <SectionSelect value={sectionId} onChange={setSectionId} allLabel={`All ${term.class.toLowerCase()}es`} className="sm:w-56" />
          <Button variant="ghost" className="sm:ml-auto" onClick={() => download(`/reports/students?format=xlsx${sectionId ? `&sectionId=${sectionId}` : ''}`, 'students.xlsx').catch((e) => toast.error(e.message))}>
            <Download className="size-4" /> Export
          </Button>
        </div>
        {students.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !students.data?.length ? (
          <EmptyState
            icon={GraduationCap}
            title={query || sectionId ? 'No matches' : `No ${term.student.toLowerCase()}s yet`}
            description={query || sectionId ? 'Try another name or section.' : 'Admit students one by one, or import your existing list from Excel.'}
            action={
              !query && !sectionId && can('students.manage') ? (
                <Button onClick={() => setImportOpen(true)}>
                  <FileSpreadsheet className="size-4" /> Import from Excel
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{term.student}</Th>
                <Th>Admission no.</Th>
                <Th>
                  {term.class} · {term.section}
                </Th>
                <Th className="text-right">Roll</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {students.data.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <Link href={`/admin/students/${s.id}`} className="flex items-center gap-3 font-medium hover:text-brand">
                      <Avatar name={s.name} size={32} />
                      {s.name}
                    </Link>
                  </Td>
                  <Td className="tabular-nums text-text-2">{s.admissionNo}</Td>
                  <Td className="text-text-2">{s.className ? `${s.className} · ${s.sectionName}` : <span className="text-text-3">Not enrolled</span>}</Td>
                  <Td className="text-right tabular-nums text-text-2">{s.rollNo ?? '—'}</Td>
                  <Td>
                    <Badge tone={s.status === 'active' ? 'success' : 'neutral'} dot>
                      {s.status === 'active' ? 'Active' : s.status}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <AdmitSheet open={admitOpen} onOpenChange={setAdmitOpen} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}

interface GuardianDraft {
  name: string;
  phone: string;
  relation: 'mother' | 'father' | 'guardian' | 'other';
  whatsappOptIn: boolean;
  language: string;
}

const emptyGuardian = (): GuardianDraft => ({ name: '', phone: '', relation: 'mother', whatsappOptIn: true, language: 'en' });

function toE164(raw: string) {
  const d = raw.replace(/[^\d+]/g, '');
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : d;
}

function AdmitSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { term } = useApp();
  const [form, setForm] = useState({ name: '', admissionNo: '', dob: '', gender: '', sectionId: '', rollNo: '' });
  const [guardians, setGuardians] = useState<GuardianDraft[]>([emptyGuardian()]);
  const admit = useMutate(
    (body: object) => api<{ id: string; name: string }>('/students', { method: 'POST', body }),
    {
      invalidate: ['/students'],
      success: (s) => `${s.name} admitted`,
      onSuccess: () => {
        onOpenChange(false);
        setForm({ name: '', admissionNo: '', dob: '', gender: '', sectionId: '', rollNo: '' });
        setGuardians([emptyGuardian()]);
      },
    },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    admit.mutate({
      name: form.name,
      admissionNo: form.admissionNo || undefined,
      dob: form.dob || undefined,
      gender: form.gender || undefined,
      sectionId: form.sectionId || undefined,
      rollNo: form.rollNo ? Number(form.rollNo) : undefined,
      guardians: guardians.map((g, i) => ({ ...g, phone: toE164(g.phone), isPrimary: i === 0 })),
    });
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setG = (i: number, patch: Partial<GuardianDraft>) => setGuardians((list) => list.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Admit a ${term.student.toLowerCase()}`}
      description="Guardians can then sign in to the parent app with their mobile number."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="admit-form" loading={admit.isPending}>
            Admit
          </Button>
        </>
      }
    >
      <form id="admit-form" onSubmit={submit} className="space-y-6">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-[13px] font-semibold text-text">{term.student}</legend>
          <Field label="Full name" className="sm:col-span-2">
            {(id) => <Input id={id} value={form.name} onChange={set('name')} required minLength={2} autoFocus />}
          </Field>
          <Field label="Admission number" hint="Leave blank to number automatically">
            {(id) => <Input id={id} value={form.admissionNo} onChange={set('admissionNo')} />}
          </Field>
          <Field label="Date of birth">{(id) => <Input id={id} type="date" value={form.dob} onChange={set('dob')} />}</Field>
          <Field label="Gender">
            {(id) => (
              <Select id={id} value={form.gender} onChange={set('gender')}>
                <option value="">Not specified</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </Select>
            )}
          </Field>
          <Field label={`${term.class} and ${term.section.toLowerCase()}`}>
            {(id) => <SectionSelect id={id} value={form.sectionId} onChange={(v) => setForm((f) => ({ ...f, sectionId: v }))} allLabel="Enroll later" />}
          </Field>
          <Field label="Roll number" hint="Optional">
            {(id) => <Input id={id} inputMode="numeric" value={form.rollNo} onChange={set('rollNo')} disabled={!form.sectionId} />}
          </Field>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-[13px] font-semibold text-text">Parents and guardians</legend>
          {guardians.map((g, i) => (
            <div key={i} className="rounded-xl border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <Badge tone={i === 0 ? 'brand' : 'neutral'}>{i === 0 ? 'Primary contact' : `Guardian ${i + 1}`}</Badge>
                {i > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setGuardians((list) => list.filter((_, j) => j !== i))} aria-label="Remove guardian">
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">{(id) => <Input id={id} value={g.name} onChange={(e) => setG(i, { name: e.target.value })} required minLength={2} />}</Field>
                <Field label="Mobile">{(id) => <Input id={id} inputMode="tel" placeholder="98765 43210" value={g.phone} onChange={(e) => setG(i, { phone: e.target.value })} required />}</Field>
                <Field label="Relation">
                  {(id) => (
                    <Select id={id} value={g.relation} onChange={(e) => setG(i, { relation: e.target.value as GuardianDraft['relation'] })}>
                      <option value="mother">Mother</option>
                      <option value="father">Father</option>
                      <option value="guardian">Guardian</option>
                      <option value="other">Other</option>
                    </Select>
                  )}
                </Field>
                <Field label="Message language">
                  {(id) => (
                    <Select id={id} value={g.language} onChange={(e) => setG(i, { language: e.target.value })}>
                      <option value="en">English</option>
                      <option value="hi">हिन्दी (Hindi)</option>
                    </Select>
                  )}
                </Field>
              </div>
              <div className="mt-3">
                <Checkbox label="Agreed to WhatsApp messages" description="Without consent, updates go by SMS." checked={g.whatsappOptIn} onChange={(e) => setG(i, { whatsappOptIn: e.target.checked })} />
              </div>
            </div>
          ))}
          {guardians.length < 4 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setGuardians((l) => [...l, { ...emptyGuardian(), relation: 'father' }])}>
              <Plus className="size-4" /> Add another guardian
            </Button>
          )}
        </fieldset>
      </form>
    </Sheet>
  );
}

interface ImportReport {
  total: number;
  valid: number;
  errors: { row: number; column: string; message: string }[];
  errorCsv: string | null;
  imported: number;
  dryRun: boolean;
}

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.append('file', file);
    const res = await apiRaw(`/students/import${dryRun ? '?dryRun=true' : ''}`, { method: 'POST', form });
    const body = (await res.json()) as ImportReport & { message?: string };
    setBusy(false);
    if (!res.ok && !body.errors) return toast.error(body.message ?? 'Import failed');
    setReport(body);
    if (!dryRun && res.ok) {
      toast.success(`${body.imported} students imported`);
      await client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/students') });
      close();
    }
  }

  function close() {
    onOpenChange(false);
    setFile(null);
    setReport(null);
  }

  function downloadErrors() {
    if (!report?.errorCsv) return;
    const url = URL.createObjectURL(new Blob([report.errorCsv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: 'import-errors.csv' }).click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title="Import students"
      description="Upload Excel (.xlsx) or CSV. We check every row before anything is saved."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          {report && report.errors.length === 0 ? (
            <Button onClick={() => run(false)} loading={busy}>
              Import {report.valid} students
            </Button>
          ) : (
            <Button onClick={() => run(true)} loading={busy} disabled={!file}>
              Check file
            </Button>
          )}
        </>
      }
    >
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong bg-surface-2/50 px-6 py-8 text-center transition-colors hover:border-brand hover:bg-brand-soft/40">
        <FileSpreadsheet className="size-8 text-brand" />
        <span className="text-sm font-medium">{file ? file.name : 'Choose a spreadsheet'}</span>
        <span className="text-[12px] text-text-3">Columns: name, class, section, roll_no, dob, gender, guardian_name, guardian_phone, guardian_relation</span>
        <input type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setReport(null))} />
      </label>

      {report && (
        <div className="mt-5 animate-in">
          {report.errors.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
              <CheckCircle2 className="size-5 shrink-0" />
              All {report.total} rows look good. Nothing has been saved yet.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
                <span className="flex items-center gap-3">
                  <AlertCircle className="size-5 shrink-0" />
                  {report.errors.length} problem{report.errors.length > 1 ? 's' : ''} in {report.total} rows. Fix them and upload again — nothing was imported.
                </span>
                <Button variant="outline" size="sm" onClick={downloadErrors}>
                  <Download className="size-4" /> Error file
                </Button>
              </div>
              <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-border">
                <Table>
                  <thead>
                    <tr>
                      <Th>Row</Th>
                      <Th>Column</Th>
                      <Th>Problem</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.errors.map((e, i) => (
                      <Tr key={i}>
                        <Td className="tabular-nums">{e.row}</Td>
                        <Td className="font-mono text-[12.5px]">{e.column}</Td>
                        <Td>{e.message}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
