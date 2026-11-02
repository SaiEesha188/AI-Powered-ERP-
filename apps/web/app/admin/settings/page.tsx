'use client';

import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '@/components/app/context';
import { PageHeader } from '@/components/app/page';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useMutate } from '@/lib/query';
import type { Institute, Terminology } from '@/lib/types';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TERMS: { key: keyof Terminology; label: string; example: string }[] = [
  { key: 'class', label: 'Class', example: 'Class / Batch / Course' },
  { key: 'section', label: 'Section', example: 'Section / Group' },
  { key: 'homework', label: 'Homework', example: 'Homework / Assignment / DPP' },
  { key: 'student', label: 'Student', example: 'Student / Learner' },
  { key: 'teacher', label: 'Teacher', example: 'Teacher / Faculty' },
  { key: 'exam', label: 'Exam', example: 'Exam / Test' },
];

export default function SettingsPage() {
  const { institute, can } = useApp();
  const editable = can('institute.settings.manage');
  const [draft, setDraft] = useState(institute);
  useEffect(() => setDraft(institute), [institute]);
  const s = draft.settings;
  const save = useMutate(
    (body: object) => api<Institute>('/institute', { method: 'PATCH', body }),
    { invalidate: ['/institute'], success: 'Settings saved' },
  );
  const setSettings = (patch: Partial<Institute['settings']>) => setDraft((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(institute);

  function submit() {
    save.mutate({
      name: draft.name,
      board: draft.board,
      terminology: s.terminology,
      branding: Object.fromEntries(Object.entries(s.branding).filter(([, v]) => v)),
      workingDays: s.workingDays,
      holidayApprovalRequired: s.holidayApprovalRequired,
      circularApprovalRequired: s.circularApprovalRequired,
      homeworkDigestTime: s.homeworkDigestTime,
      attendanceCutoffTime: s.attendanceCutoffTime,
    });
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="How the platform fits the way your institute works."
        actions={
          editable && (
            <Button onClick={submit} loading={save.isPending} disabled={!dirty}>
              <Save className="size-4" /> Save changes
            </Button>
          )
        }
      />
      <fieldset disabled={!editable} className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Institute" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2">{(id) => <Input id={id} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}</Field>
            <Field label="Board" hint="CBSE, ICSE, State…">{(id) => <Input id={id} value={draft.board ?? ''} onChange={(e) => setDraft({ ...draft, board: e.target.value || null })} />}</Field>
            <Field label="Address" hint="Your sign-in link">{(id) => <Input id={id} value={`${draft.subdomain}`} disabled />}</Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="School week and times" />
          <CardBody className="space-y-5">
            <Field label="Working days" hint="Attendance is blocked on the other days">
              {() => (
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d, i) => {
                    const day = i + 1;
                    const on = s.workingDays.includes(day);
                    return (
                      <button
                        type="button"
                        key={d}
                        aria-pressed={on}
                        onClick={() => setSettings({ workingDays: on ? s.workingDays.filter((x) => x !== day) : [...s.workingDays, day].sort() })}
                        className={cn('h-10 w-12 rounded-xl border text-[13px] font-semibold transition-colors', on ? 'border-brand bg-brand text-on-brand' : 'border-border text-text-3 hover:bg-surface-2')}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Attendance due by" hint="Marked later counts as late on the dashboard">
                {(id) => <Input id={id} type="time" value={s.attendanceCutoffTime} onChange={(e) => setSettings({ attendanceCutoffTime: e.target.value })} />}
              </Field>
              <Field label="Daily homework digest" hint="One WhatsApp per child at this time">
                {(id) => <Input id={id} type="time" value={s.homeworkDigestTime} onChange={(e) => setSettings({ homeworkDigestTime: e.target.value })} />}
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Words your institute uses" description="Shown across the apps and in messages" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {TERMS.map((t) => (
              <Field key={t.key} label={t.label} hint={t.example}>
                {(id) => <Input id={id} value={s.terminology[t.key]} onChange={(e) => setSettings({ terminology: { ...s.terminology, [t.key]: e.target.value } })} />}
              </Field>
            ))}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Approvals" />
            <CardBody className="space-y-4">
              <Checkbox
                label="Principal approves holidays"
                description="Holidays declared by the office wait for approval before families are told."
                checked={s.holidayApprovalRequired}
                onChange={(e) => setSettings({ holidayApprovalRequired: e.target.checked })}
              />
              <Checkbox
                label="Principal approves circulars"
                description="Circulars from staff wait for approval before they are sent."
                checked={s.circularApprovalRequired}
                onChange={(e) => setSettings({ circularApprovalRequired: e.target.checked })}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Branding" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="WhatsApp sender name">
                {(id) => <Input id={id} value={s.branding.whatsappSenderName ?? ''} onChange={(e) => setSettings({ branding: { ...s.branding, whatsappSenderName: e.target.value } })} />}
              </Field>
              <Field label="Report card header">
                {(id) => <Input id={id} value={s.branding.reportCardHeader ?? ''} onChange={(e) => setSettings({ branding: { ...s.branding, reportCardHeader: e.target.value } })} />}
              </Field>
            </CardBody>
          </Card>
        </div>
      </fieldset>
    </>
  );
}
