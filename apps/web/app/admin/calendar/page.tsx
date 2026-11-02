'use client';

import { Check, ChevronLeft, ChevronRight, Clock3, Plus, Trash2, X } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useApp } from '@/components/app/context';
import { PageHeader } from '@/components/app/page';
import { EVENT_TYPE } from '@/components/app/status';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Sheet } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { addDays, cn, formatDate, todayLocal } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { CalendarEvent, ClassRow } from '@/lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthGrid(month: string) {
  const first = `${month}-01`;
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const start = addDays(first, -weekday);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

export default function CalendarPage() {
  const { can, institute } = useApp();
  const today = todayLocal();
  const [month, setMonth] = useState(today.slice(0, 7));
  const days = useMemo(() => monthGrid(month), [month]);
  const events = useApi<CalendarEvent[]>(`/calendar/events?from=${days[0]}&to=${days[41]}`);
  const [open, setOpen] = useState<string | null>(null);
  const decide = useMutate(({ id, decision }: { id: string; decision: 'approve' | 'reject' }) => api(`/calendar/events/${id}/decision`, { method: 'POST', body: { decision } }), {
    invalidate: ['/calendar', '/dashboards'],
    success: 'Updated',
  });
  const remove = useMutate((id: string) => api(`/calendar/events/${id}`, { method: 'DELETE' }), { invalidate: ['/calendar', '/dashboards'], success: 'Deleted' });

  const list = events.data ?? [];
  const pending = list.filter((e) => e.status === 'pending');
  const on = (d: string) => list.filter((e) => e.status !== 'rejected' && e.startDate <= d && e.endDate >= d);
  const upcoming = list.filter((e) => e.endDate >= today && e.status === 'approved').slice(0, 8);

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Holidays, events and exams. Holidays block attendance and move homework due dates automatically."
        actions={
          can('calendar.manage') && (
            <Button onClick={() => setOpen(today)}>
              <Plus className="size-4" /> Add holiday or event
            </Button>
          )
        }
      />

      {pending.length > 0 && can('calendar.approve') && (
        <Card className="mb-6 border-warning/40">
          <CardHeader title="Waiting for your approval" description="Families are told once you approve" />
          <CardBody className="space-y-2 pt-3">
            {pending.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-warning-soft/60 px-4 py-3">
                <Clock3 className="size-4 text-warning" />
                <span className="flex-1 text-sm">
                  <span className="font-semibold">{e.title}</span> · {formatDate(e.startDate)}
                  {e.endDate !== e.startDate ? ` – ${formatDate(e.endDate)}` : ''}
                </span>
                <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: e.id, decision: 'reject' })}>
                  <X className="size-4" /> Reject
                </Button>
                <Button size="sm" onClick={() => decide.mutate({ id: e.id, decision: 'approve' })}>
                  <Check className="size-4" /> Approve
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-[15px] font-semibold">{formatDate(`${month}-01`, { month: 'long', year: 'numeric' })}</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setMonth(today.slice(0, 7))}>
                Today
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 border-b border-border bg-surface-2/50 text-center text-[11.5px] font-semibold uppercase tracking-wide text-text-3">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const inMonth = d.startsWith(month);
              const weekday = ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
              const off = !institute.settings.workingDays.includes(weekday);
              const items = on(d);
              return (
                <button
                  key={d}
                  onClick={() => can('calendar.manage') && setOpen(d)}
                  className={cn(
                    'group flex min-h-24 flex-col items-stretch justify-start border-b border-r border-border p-1.5 text-left transition-colors last:border-r-0 [&:nth-child(7n)]:border-r-0 sm:min-h-28',
                    !inMonth && 'bg-surface-2/40 text-text-3',
                    off && inMonth && 'bg-surface-2/60',
                    can('calendar.manage') && 'hover:bg-brand-soft/40',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex size-7 self-start items-center justify-center rounded-full text-[12.5px] font-medium tabular-nums',
                      d === today ? 'bg-brand text-on-brand' : inMonth ? 'text-text' : 'text-text-3',
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                  <span className="mt-1 block space-y-1">
                    {items.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className={cn(
                          'block truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                          EVENT_TYPE[e.type]?.chip,
                          e.status === 'pending' && 'border border-dashed border-warning opacity-80',
                        )}
                      >
                        {e.title}
                      </span>
                    ))}
                    {items.length > 3 && <span className="block px-1.5 text-[11px] text-text-3">+{items.length - 3} more</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="self-start">
          <CardHeader title="Upcoming" />
          <CardBody className="space-y-3 pt-3">
            {upcoming.length === 0 && <p className="text-sm text-text-3">Nothing coming up this month.</p>}
            {upcoming.map((e) => (
              <div key={e.id} className="group flex items-start gap-3">
                <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', EVENT_TYPE[e.type]?.dot)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{e.title}</p>
                  <p className="text-[12.5px] text-text-3">
                    {formatDate(e.startDate, { weekday: 'short', day: 'numeric', month: 'short' })}
                    {e.endDate !== e.startDate ? ` – ${formatDate(e.endDate, { day: 'numeric', month: 'short' })}` : ''}
                    {e.scope === 'classes' ? ` · ${e.classes.map((c) => c.className).join(', ')}` : e.scope === 'staff' ? ' · Staff only' : ''}
                  </p>
                </div>
                <Badge tone={EVENT_TYPE[e.type]?.tone}>{EVENT_TYPE[e.type]?.label}</Badge>
                {can('calendar.manage') && (
                  <button className="rounded-lg p-1 text-text-3 opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100 focus:opacity-100" onClick={() => remove.mutate(e.id)} aria-label={`Delete ${e.title}`}>
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {open && <EventSheet date={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function EventSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { can, institute, term } = useApp();
  const classes = useApi<ClassRow[]>('/classes');
  const [form, setForm] = useState({ type: 'holiday', title: '', description: '', startDate: date, endDate: date, scope: 'all' });
  const [classIds, setClassIds] = useState<string[]>([]);
  const create = useMutate((body: object) => api<CalendarEvent>('/calendar/events', { method: 'POST', body }), {
    invalidate: ['/calendar', '/dashboards'],
    success: (e) => (e.status === 'pending' ? 'Sent to the principal for approval' : 'Added and families notified'),
    onSuccess: onClose,
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value, ...(k === 'startDate' && f.endDate < e.target.value ? { endDate: e.target.value } : {}) }));
  const needsApproval = form.type === 'holiday' && institute.settings.holidayApprovalRequired && !can('calendar.approve');

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate({ ...form, description: form.description || undefined, classIds: form.scope === 'classes' ? classIds : [] });
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add to the calendar"
      description={needsApproval ? 'Holidays need principal approval before families are told.' : 'Families and staff are notified on WhatsApp.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="event-form" loading={create.isPending} disabled={form.scope === 'classes' && !classIds.length}>
            {needsApproval ? 'Send for approval' : 'Add and notify'}
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" className="sm:col-span-2">
          {() => (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {Object.entries(EVENT_TYPE).map(([k, v]) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setForm((f) => ({ ...f, type: k }))}
                  className={cn('rounded-xl border px-2 py-2.5 text-[13px] font-medium transition-colors', form.type === k ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:bg-surface-2')}
                  aria-pressed={form.type === k}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field label="Title" className="sm:col-span-2">
          {(id) => <Input id={id} placeholder={form.type === 'holiday' ? 'Diwali' : 'Annual sports day'} value={form.title} onChange={set('title')} required minLength={2} autoFocus />}
        </Field>
        <Field label="From">{(id) => <Input id={id} type="date" value={form.startDate} onChange={set('startDate')} required />}</Field>
        <Field label="To">{(id) => <Input id={id} type="date" value={form.endDate} min={form.startDate} onChange={set('endDate')} required />}</Field>
        <Field label="Who it applies to" className="sm:col-span-2">
          {(id) => (
            <Select id={id} value={form.scope} onChange={set('scope')}>
              <option value="all">Whole institute</option>
              <option value="classes">Selected {term.class.toLowerCase()}es</option>
              <option value="staff">Staff only</option>
            </Select>
          )}
        </Field>
        {form.scope === 'classes' && (
          <div className="grid grid-cols-2 gap-2 sm:col-span-2">
            {(classes.data ?? []).map((c) => (
              <Checkbox key={c.id} label={c.name} checked={classIds.includes(c.id)} onChange={(e) => setClassIds((l) => (e.target.checked ? [...l, c.id] : l.filter((x) => x !== c.id)))} />
            ))}
          </div>
        )}
        <Field label="Note for families" hint="Optional" className="sm:col-span-2">
          {(id) => <Textarea id={id} value={form.description} onChange={set('description')} />}
        </Field>
      </form>
    </Sheet>
  );
}
