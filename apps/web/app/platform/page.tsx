'use client';

import { AlertTriangle, Building2, MessageCircle, Plus, School } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { PageHeader } from '@/components/app/page';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, Progress, Skeleton, StatCard } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { Sheet } from '@/components/ui/overlay';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDate, percent, todayLocal } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { OrgUsage, Tenant } from '@/lib/types';

const VERTICALS = [
  ['school', 'K-12 school'],
  ['coaching', 'Coaching centre'],
  ['college', 'College / institute'],
  ['skill', 'Skill / vocational institute'],
  ['academy', 'Academy (sports, music, dance)'],
  ['corporate', 'Corporate training'],
];

export default function PlatformHome() {
  const month = todayLocal().slice(0, 7);
  const tenants = useApi<Tenant[]>('/platform/tenants', { noInstitute: true });
  const usage = useApi<OrgUsage[]>(`/platform/usage?month=${month}`, { noInstitute: true });
  const [open, setOpen] = useState(false);
  const used = (usage.data ?? []).reduce((n, o) => n + o.used, 0);
  const alerts = (usage.data ?? []).filter((o) => o.alert);

  return (
    <>
      <PageHeader
        title="Institutes"
        description="Every organisation on the platform, their plan and this month’s WhatsApp usage."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Onboard institute
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Institutes" value={tenants.data?.length ?? '—'} icon={School} tone="brand" />
        <StatCard label="Organisations" value={usage.data?.length ?? '—'} icon={Building2} tone="accent" />
        <StatCard label="WhatsApp this month" value={used.toLocaleString('en-IN')} icon={MessageCircle} tone="success" hint={formatDate(`${month}-01`, { month: 'long', year: 'numeric' })} />
        <StatCard label="Quota alerts" value={alerts.length} icon={AlertTriangle} tone={alerts.length ? 'warning' : 'neutral'} hint="At 80% or over quota" />
      </div>

      <Card className="mt-6">
        {tenants.isLoading ? (
          <Skeleton className="m-4 h-48" />
        ) : !tenants.data?.length ? (
          <EmptyState icon={School} title="No institutes yet" action={<Button onClick={() => setOpen(true)}>Onboard the first</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Institute</Th>
                <Th>Organisation</Th>
                <Th>Plan</Th>
                <Th>Renews</Th>
                <Th className="w-56">WhatsApp quota</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {tenants.data.map((t) => {
                const u = usage.data?.find((o) => o.id === t.organizationId);
                return (
                  <Tr key={t.instituteId}>
                    <Td>
                      <p className="font-medium">{t.name}</p>
                      <p className="text-[12px] capitalize text-text-3">
                        {t.vertical} · {t.subdomain}
                      </p>
                    </Td>
                    <Td className="text-text-2">{t.organizationName}</Td>
                    <Td>
                      <Badge tone="brand" className="capitalize">
                        {t.plan ?? '—'}
                      </Badge>
                      {t.seats ? <span className="ml-2 text-[12px] text-text-3">{t.seats} seats</span> : null}
                    </Td>
                    <Td className="text-text-2">{formatDate(t.renewalDate)}</Td>
                    <Td>
                      {u ? (
                        <span className="flex items-center gap-2">
                          <Progress value={u.percent ?? 0} tone={u.alert === 'exceeded' ? 'danger' : u.alert ? 'warning' : 'accent'} />
                          <span className="w-24 shrink-0 text-right text-[12px] tabular-nums text-text-2">
                            {u.used.toLocaleString('en-IN')} / {u.quota?.toLocaleString('en-IN') ?? '∞'}
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>
                      <Badge tone={t.status === 'active' ? 'success' : 'neutral'} dot>
                        {t.status}
                      </Badge>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {open && <OnboardSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function OnboardSheet({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ orgName: '', orgType: 'trust', name: '', vertical: 'school', board: '', subdomain: '', planCode: 'standard', seats: '500', adminName: '', adminPhone: '' });
  const create = useMutate((body: object) => api('/platform/tenants', { method: 'POST', body, noInstitute: true }), {
    invalidate: ['/platform'],
    success: 'Institute created. The admin can sign in with their mobile number.',
    onSuccess: onClose,
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const digits = form.adminPhone.replace(/[^\d+]/g, '');
    create.mutate({
      organization: { name: form.orgName, type: form.orgType },
      institute: { name: form.name, vertical: form.vertical, board: form.board || undefined, subdomain: form.subdomain },
      planCode: form.planCode,
      seats: Number(form.seats),
      admin: { name: form.adminName, phone: /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : digits },
    });
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Onboard an institute"
      description="Creates the organisation, its first institute with the vertical pack, the standard roles and the first admin."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="tenant-form" loading={create.isPending}>
            Create institute
          </Button>
        </>
      }
    >
      <form id="tenant-form" onSubmit={submit} className="space-y-6">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-[13px] font-semibold">Organisation (the customer)</legend>
          <Field label="Name" className="sm:col-span-2">{(id) => <Input id={id} placeholder="Sunrise Education Trust" value={form.orgName} onChange={set('orgName')} required autoFocus />}</Field>
          <Field label="Type">
            {(id) => (
              <Select id={id} value={form.orgType} onChange={set('orgType')}>
                <option value="trust">Trust</option>
                <option value="chain">School chain</option>
                <option value="coaching">Coaching brand</option>
                <option value="college">College</option>
                <option value="company">Company</option>
                <option value="other">Other</option>
              </Select>
            )}
          </Field>
          <Field label="Plan">
            {(id) => (
              <Select id={id} value={form.planCode} onChange={set('planCode')}>
                <option value="starter">Starter</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </Select>
            )}
          </Field>
          <Field label="Seats (students)">{(id) => <Input id={id} inputMode="numeric" value={form.seats} onChange={set('seats')} required />}</Field>
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-[13px] font-semibold">Institute</legend>
          <Field label="Name" className="sm:col-span-2">{(id) => <Input id={id} placeholder="Sunrise Public School" value={form.name} onChange={set('name')} required />}</Field>
          <Field label="Vertical pack">
            {(id) => (
              <Select id={id} value={form.vertical} onChange={set('vertical')}>
                {VERTICALS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Board" hint="Optional">{(id) => <Input id={id} placeholder="CBSE" value={form.board} onChange={set('board')} />}</Field>
          <Field label="Subdomain" hint="Lowercase letters, digits, hyphens" className="sm:col-span-2">
            {(id) => <Input id={id} placeholder="sunrise" value={form.subdomain} onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase() })} required pattern="[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])" />}
          </Field>
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-[13px] font-semibold">First admin</legend>
          <Field label="Name">{(id) => <Input id={id} value={form.adminName} onChange={set('adminName')} required />}</Field>
          <Field label="Mobile">{(id) => <Input id={id} inputMode="tel" placeholder="98765 43210" value={form.adminPhone} onChange={set('adminPhone')} required />}</Field>
        </fieldset>
      </form>
    </Sheet>
  );
}
