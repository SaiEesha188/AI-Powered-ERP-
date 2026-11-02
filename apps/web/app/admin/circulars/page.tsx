'use client';

import { CheckCheck, Clock3, FilePenLine, Megaphone, PenSquare, Send } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { AttachmentPicker } from '@/components/app/attachments';
import { useApp } from '@/components/app/context';
import { PageHeader } from '@/components/app/page';
import { sectionLabel, useSections } from '@/components/app/pickers';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, Progress, Skeleton } from '@/components/ui/card';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Sheet, Tabs } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { Circular, ClassRow, FileLink } from '@/lib/types';

const STATUS = {
  published: { label: 'Published', tone: 'success' as const, icon: CheckCheck },
  pending_approval: { label: 'Awaiting approval', tone: 'warning' as const, icon: Clock3 },
  draft: { label: 'Draft', tone: 'neutral' as const, icon: FilePenLine },
};

export default function CircularsPage() {
  const { can } = useApp();
  const [tab, setTab] = useState('published');
  const circulars = useApi<Circular[]>(`/circulars?status=${tab}`);
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Circulars"
        description="Notices reach parents and staff on WhatsApp, with read receipts and “I agree” consent."
        actions={
          can('comms.send') && (
            <Button onClick={() => setOpen(true)}>
              <PenSquare className="size-4" /> New circular
            </Button>
          )
        }
      />
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'published', label: 'Published' },
          { value: 'pending_approval', label: 'Awaiting approval' },
          { value: 'draft', label: 'Drafts' },
        ]}
      />
      <div className="mt-4 space-y-3">
        {circulars.isLoading ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24" />)
        ) : !circulars.data?.length ? (
          <Card>
            <EmptyState icon={Megaphone} title="Nothing here" description={tab === 'published' ? 'Published circulars and their read rates appear here.' : undefined} />
          </Card>
        ) : (
          circulars.data.map((c) => {
            const s = STATUS[c.status];
            const readPct = c.recipients ? ((c.read ?? 0) / c.recipients) * 100 : 0;
            const ackPct = c.recipients ? ((c.acknowledged ?? 0) / c.recipients) * 100 : 0;
            return (
              <Link key={c.id} href={`/admin/circulars/${c.id}`}>
                <Card className="p-5 transition-shadow hover:shadow-pop">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={s.tone}>
                          <s.icon className="size-3" /> {s.label}
                        </Badge>
                        {c.type === 'notice' && <Badge>Notice</Badge>}
                        {c.requiresAck && <Badge tone="accent">Needs “I agree”</Badge>}
                      </div>
                      <h3 className="mt-2 truncate text-[15px] font-semibold">{c.title}</h3>
                      <p className="mt-0.5 line-clamp-1 text-[13px] text-text-3">{c.body}</p>
                    </div>
                    {c.status === 'published' && (
                      <div className="grid w-full shrink-0 gap-2 sm:w-64">
                        <div>
                          <div className="mb-1 flex justify-between text-[12px] text-text-3">
                            <span>Read</span>
                            <span className="tabular-nums">
                              {c.read}/{c.recipients}
                            </span>
                          </div>
                          <Progress value={readPct} tone="accent" />
                        </div>
                        {c.requiresAck && (
                          <div>
                            <div className="mb-1 flex justify-between text-[12px] text-text-3">
                              <span>Agreed</span>
                              <span className="tabular-nums">
                                {c.acknowledged}/{c.recipients}
                              </span>
                            </div>
                            <Progress value={ackPct} tone="success" />
                          </div>
                        )}
                      </div>
                    )}
                    <p className="shrink-0 text-[12.5px] text-text-3 sm:w-24 sm:text-right">{formatDate(c.publishedAt ?? c.createdAt, { day: 'numeric', month: 'short' })}</p>
                  </div>
                </Card>
              </Link>
            );
          })
        )}
      </div>
      {open && <ComposeSheet onClose={() => setOpen(false)} onSent={(status) => setTab(status)} />}
    </>
  );
}

type AudienceKind = 'all' | 'parents' | 'staff' | 'class' | 'section';

function ComposeSheet({ onClose, onSent }: { onClose: () => void; onSent: (status: string) => void }) {
  const { can, institute, term } = useApp();
  const classes = useApi<ClassRow[]>('/classes');
  const sections = useSections();
  const wide = can('comms.approve') || can('academics.manage');
  const [form, setForm] = useState({ type: 'circular', title: '', body: '', requiresAck: false });
  const [kind, setKind] = useState<AudienceKind>(wide ? 'parents' : 'section');
  const [refs, setRefs] = useState<string[]>([]);
  const [files, setFiles] = useState<FileLink[]>([]);
  const send = useMutate((body: object) => api<Circular>('/circulars', { method: 'POST', body }), {
    invalidate: ['/circulars', '/dashboards'],
    success: (c) => (c.status === 'published' ? 'Published — recipients are being notified' : c.status === 'pending_approval' ? 'Sent to the principal for approval' : 'Draft saved'),
    onSuccess: (c) => (onSent(c.status), onClose()),
  });
  const needsApproval = institute.settings.circularApprovalRequired && !can('comms.approve');

  function submit(publish: boolean) {
    const audiences = kind === 'class' || kind === 'section' ? refs.map((refId) => ({ type: kind, refId })) : [{ type: kind }];
    send.mutate({ ...form, audiences, fileIds: files.map((f) => f.id), publish });
  }

  const KINDS: { value: AudienceKind; label: string; hide?: boolean }[] = [
    { value: 'parents', label: 'All parents', hide: !wide },
    { value: 'staff', label: 'All staff', hide: !wide },
    { value: 'all', label: 'Everyone', hide: !wide },
    { value: 'class', label: `By ${term.class.toLowerCase()}`, hide: !wide },
    { value: 'section', label: `By ${term.section.toLowerCase()}` },
  ];

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="New circular"
      description={needsApproval ? 'Your institute asks the principal to approve circulars before they are sent.' : 'Sent on WhatsApp (SMS for parents without WhatsApp consent).'}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => submit(false)} disabled={send.isPending || !form.title}>
            Save draft
          </Button>
          <Button type="submit" form="circular-form" loading={send.isPending}>
            <Send className="size-4" /> {needsApproval ? 'Send for approval' : 'Publish'}
          </Button>
        </>
      }
    >
      <form id="circular-form" onSubmit={(e: FormEvent) => (e.preventDefault(), submit(true))} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <Field label="Title">{(id) => <Input id={id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} autoFocus />}</Field>
          <Field label="Kind">
            {(id) => (
              <Select id={id} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="circular">Circular</option>
                <option value="notice">Notice</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label="Message">{(id) => <Textarea id={id} className="min-h-40" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />}</Field>
        <div>
          <p className="mb-2 text-[13px] font-medium text-text-2">Send to</p>
          <div className="flex flex-wrap gap-2">
            {KINDS.filter((k) => !k.hide).map((k) => (
              <button
                type="button"
                key={k.value}
                onClick={() => (setKind(k.value), setRefs([]))}
                aria-pressed={kind === k.value}
                className={cn('rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors', kind === k.value ? 'border-brand bg-brand text-on-brand' : 'border-border hover:bg-surface-2')}
              >
                {k.label}
              </button>
            ))}
          </div>
          {(kind === 'class' || kind === 'section') && (
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-border p-3 sm:grid-cols-3">
              {(kind === 'class' ? (classes.data ?? []).map((c) => ({ id: c.id, label: c.name })) : (sections.data ?? []).map((s) => ({ id: s.id, label: sectionLabel(s) }))).map((o) => (
                <Checkbox key={o.id} label={o.label} checked={refs.includes(o.id)} onChange={(e) => setRefs((l) => (e.target.checked ? [...l, o.id] : l.filter((x) => x !== o.id)))} />
              ))}
            </div>
          )}
        </div>
        <Field label="Attachments">{() => <AttachmentPicker value={files} onChange={setFiles} />}</Field>
        <Checkbox label="Ask for “I agree”" description="For consent forms: you’ll see who agreed and who hasn’t." checked={form.requiresAck} onChange={(e) => setForm({ ...form, requiresAck: e.target.checked })} />
      </form>
    </Sheet>
  );
}
