'use client';

import { Phone, UserPlus, Users } from 'lucide-react';
import { type FormEvent, useDeferredValue, useState } from 'react';
import { useApp } from '@/components/app/context';
import { PageHeader } from '@/components/app/page';
import { SearchInput } from '@/components/app/pickers';
import { ROLE_LABEL } from '@/components/app/status';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { Sheet } from '@/components/ui/overlay';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDate, formatPhone } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { StaffRow } from '@/lib/types';

const ASSIGNABLE = ['teacher', 'class_teacher', 'principal', 'admin', 'accountant'];

export default function StaffPage() {
  const { can } = useApp();
  const staff = useApi<StaffRow[]>('/staff');
  const [q, setQ] = useState('');
  const query = useDeferredValue(q.trim().toLowerCase());
  const [open, setOpen] = useState(false);
  const rows = (staff.data ?? []).filter((s) => !query || s.name.toLowerCase().includes(query) || s.designation.toLowerCase().includes(query));
  const active = (staff.data ?? []).filter((s) => s.status === 'active').length;

  return (
    <>
      <PageHeader
        title="Staff"
        description={staff.data ? `${active} active of ${staff.data.length}` : ' '}
        actions={
          can('staff.manage', 'users.manage') && (
            <Button onClick={() => setOpen(true)}>
              <UserPlus className="size-4" /> Add staff
            </Button>
          )
        }
      />
      <Card>
        <div className="border-b border-border p-4">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or designation" className="sm:max-w-sm" aria-label="Search staff" />
        </div>
        {staff.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title={query ? 'No matches' : 'No staff yet'} description={query ? undefined : 'Add teachers so they can sign in and take attendance.'} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Roles</Th>
                <Th>Mobile</Th>
                <Th>Joined</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={s.name} size={34} />
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-[12.5px] text-text-3">
                          {s.designation}
                          {s.employeeCode ? ` · ${s.employeeCode}` : ''}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {s.roles.map((r) => (
                        <Badge key={r} tone={r === 'class_teacher' ? 'accent' : r === 'teacher' ? 'brand' : 'neutral'}>
                          {ROLE_LABEL[r] ?? r}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1.5 text-text-2 hover:text-brand">
                      <Phone className="size-3.5" /> {formatPhone(s.phone)}
                    </a>
                  </Td>
                  <Td className="text-text-2">{formatDate(s.joiningDate)}</Td>
                  <Td>
                    <Badge tone={s.status === 'active' ? 'success' : 'neutral'} dot>
                      {s.status === 'active' ? 'Active' : 'Left'}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <AddStaffSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

function AddStaffSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [form, setForm] = useState({ name: '', phone: '', designation: '', employeeCode: '', joiningDate: '' });
  const [roles, setRoles] = useState<string[]>(['teacher']);
  const add = useMutate((body: object) => api<StaffRow>('/staff', { method: 'POST', body }), {
    invalidate: ['/staff'],
    success: (s) => `${s.name} added`,
    onSuccess: () => {
      onOpenChange(false);
      setForm({ name: '', phone: '', designation: '', employeeCode: '', joiningDate: '' });
      setRoles(['teacher']);
    },
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const digits = form.phone.replace(/[^\d+]/g, '');
    add.mutate({
      name: form.name,
      phone: /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : digits,
      designation: form.designation,
      employeeCode: form.employeeCode || undefined,
      joiningDate: form.joiningDate || undefined,
      roles,
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add a staff member"
      description="They sign in with this mobile number using a one-time code."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="staff-form" loading={add.isPending} disabled={!roles.length}>
            Add staff
          </Button>
        </>
      }
    >
      <form id="staff-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2">
          {(id) => <Input id={id} value={form.name} onChange={set('name')} required minLength={2} autoFocus />}
        </Field>
        <Field label="Mobile">{(id) => <Input id={id} inputMode="tel" placeholder="98765 43210" value={form.phone} onChange={set('phone')} required />}</Field>
        <Field label="Designation">{(id) => <Input id={id} placeholder="TGT Mathematics" value={form.designation} onChange={set('designation')} required minLength={2} />}</Field>
        <Field label="Employee code" hint="Optional">
          {(id) => <Input id={id} value={form.employeeCode} onChange={set('employeeCode')} />}
        </Field>
        <Field label="Joining date">{(id) => <Input id={id} type="date" value={form.joiningDate} onChange={set('joiningDate')} />}</Field>
        <fieldset className="space-y-3 sm:col-span-2">
          <legend className="mb-2 text-[13px] font-medium text-text-2">Roles</legend>
          {ASSIGNABLE.map((r) => (
            <Checkbox
              key={r}
              label={ROLE_LABEL[r] ?? r}
              checked={roles.includes(r)}
              onChange={(e) => setRoles((list) => (e.target.checked ? [...list, r] : list.filter((x) => x !== r)))}
            />
          ))}
        </fieldset>
      </form>
    </Sheet>
  );
}
