'use client';

import { Lock, Plus, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useApp } from '@/components/app/context';
import { PageHeader } from '@/components/app/page';
import { ROLE_LABEL } from '@/components/app/status';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { Dialog, Sheet, Tabs } from '@/components/ui/overlay';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { cn, formatPhone } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { PermissionDef, Role, UserRow } from '@/lib/types';

const MODULE_LABEL: Record<string, string> = {
  setup: 'Institute settings',
  users: 'Users and roles',
  calendar: 'Calendar',
  students: 'Students',
  staff: 'Staff',
  academics: 'Classes and timetable',
  attendance: 'Student attendance',
  staff_attendance: 'Staff attendance and leave',
  curriculum: 'Curriculum',
  homework: 'Homework',
  materials: 'Materials',
  exams: 'Exams',
  marks: 'Marks and report cards',
  comms: 'Circulars and messages',
  fees: 'Fees',
  reports: 'Reports',
  audit: 'Audit log',
};

export default function AccessPage() {
  const [tab, setTab] = useState('users');
  return (
    <>
      <PageHeader title="Users & roles" description="Who can sign in to this institute and what each role may do." />
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'users', label: 'Users' },
          { value: 'roles', label: 'Roles' },
        ]}
      />
      <div className="mt-4">{tab === 'users' ? <UsersTab /> : <RolesTab />}</div>
    </>
  );
}

function UsersTab() {
  const { can, me } = useApp();
  const users = useApi<UserRow[]>('/users');
  const roles = useApi<Role[]>('/roles');
  const [open, setOpen] = useState(false);
  const removeRole = useMutate(({ userId, role }: { userId: string; role: string }) => api(`/users/${userId}/roles/${role}`, { method: 'DELETE' }), {
    invalidate: ['/users', '/staff'],
    success: 'Role removed',
  });
  const roleName = (code: string) => roles.data?.find((r) => r.code === code)?.name ?? ROLE_LABEL[code] ?? code;

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border p-4">
        <p className="text-[13px] text-text-3">{users.data ? `${users.data.length} people` : ' '}</p>
        {can('users.manage') && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <UserPlus className="size-4" /> Add user
          </Button>
        )}
      </div>
      {users.isLoading ? (
        <Skeleton className="m-4 h-48" />
      ) : !users.data?.length ? (
        <EmptyState icon={ShieldCheck} title="No users yet" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Person</Th>
              <Th>Roles</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {users.data.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} size={32} />
                    <div>
                      <p className="font-medium">
                        {u.name} {u.id === me.user.id && <span className="text-[12px] text-text-3">(you)</span>}
                      </p>
                      <p className="text-[12px] text-text-3">{u.phone ? formatPhone(u.phone) : u.email}</p>
                    </div>
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span key={r.code} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2.5 pr-1 text-[12px] font-medium">
                        {roleName(r.code)}
                        {can('users.manage') && u.id !== me.user.id && (
                          <button className="rounded-full p-0.5 text-text-3 hover:bg-danger-soft hover:text-danger" onClick={() => removeRole.mutate({ userId: u.id, role: r.code })} aria-label={`Remove ${r.name}`}>
                            <X className="size-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </Td>
                <Td>
                  <Badge tone={u.status === 'active' ? 'success' : 'neutral'} dot>
                    {u.status === 'active' ? 'Active' : u.status}
                  </Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      {open && <AddUserSheet roles={roles.data ?? []} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function AddUserSheet({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '' });
  const [chosen, setChosen] = useState<string[]>([]);
  const add = useMutate((body: object) => api('/users', { method: 'POST', body }), { invalidate: ['/users'], success: 'User added', onSuccess: onClose });
  function submit(e: FormEvent) {
    e.preventDefault();
    const digits = form.phone.replace(/[^\d+]/g, '');
    add.mutate({ name: form.name, phone: /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : digits, roles: chosen });
  }
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a user"
      description="For office roles such as accountants or management. Add teachers under Staff instead."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={add.isPending} disabled={!chosen.length}>
            Add
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        <Field label="Full name">{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} autoFocus />}</Field>
        <Field label="Mobile">{(id) => <Input id={id} inputMode="tel" placeholder="98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />}</Field>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-text-2">Roles</legend>
          <div className="space-y-2">
            {roles
              .filter((r) => !['parent', 'student'].includes(r.code))
              .map((r) => (
                <Checkbox key={r.id} label={r.name} description={`${r.permissions.length} permissions`} checked={chosen.includes(r.code)} onChange={(e) => setChosen((l) => (e.target.checked ? [...l, r.code] : l.filter((x) => x !== r.code)))} />
              ))}
          </div>
        </fieldset>
      </form>
    </Sheet>
  );
}

function RolesTab() {
  const { can } = useApp();
  const roles = useApi<Role[]>('/roles');
  const permissions = useApi<PermissionDef[]>('/permissions');
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const remove = useMutate((id: string) => api(`/roles/${id}`, { method: 'DELETE' }), { invalidate: ['/roles'], success: 'Role deleted' });

  return (
    <>
      <div className="mb-4 flex justify-end">
        {can('roles.manage') && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Custom role
          </Button>
        )}
      </div>
      {roles.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(roles.data ?? []).map((r) => (
            <Card key={r.id} className="flex flex-col">
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {r.name} {r.isSystem && <Lock className="size-3.5 text-text-3" aria-label="System role" />}
                  </span>
                }
                description={r.isSystem ? 'Built-in role' : `Custom role · ${r.code}`}
                action={
                  !r.isSystem &&
                  can('roles.manage') && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)} aria-label={`Delete ${r.name}`}>
                        <Trash2 className="size-4 text-danger" />
                      </Button>
                    </div>
                  )
                }
              />
              <CardBody className="pt-3">
                {r.permissions.length === 0 ? (
                  <p className="text-[13px] text-text-3">No institute-wide permissions: sees only their own family’s records.</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {[...new Set(r.permissions.map((p) => p.split('.')[0]!))].map((m) => (
                      <Badge key={m}>{MODULE_LABEL[m] ?? m}</Badge>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-[12px] text-text-3">{r.permissions.length} permissions</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      {editing && <RoleDialog role={editing === 'new' ? null : editing} permissions={permissions.data ?? []} onClose={() => setEditing(null)} />}
    </>
  );
}

function RoleDialog({ role, permissions, onClose }: { role: Role | null; permissions: PermissionDef[]; onClose: () => void }) {
  const { permissions: held } = useApp();
  const [form, setForm] = useState({ code: role?.code ?? '', name: role?.name ?? '' });
  const [chosen, setChosen] = useState<string[]>(role?.permissions ?? []);
  const save = useMutate(
    (body: object) => (role ? api(`/roles/${role.id}/permissions`, { method: 'PUT', body: { permissions: chosen } }) : api('/roles', { method: 'POST', body })),
    { invalidate: ['/roles'], success: role ? 'Permissions updated' : 'Role created', onSuccess: onClose },
  );
  const modules = [...new Set(permissions.map((p) => p.module))];

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={role ? `Edit ${role.name}` : 'New custom role'}
      description="You can only grant permissions you hold yourself."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate({ ...form, permissions: chosen })} loading={save.isPending} disabled={!role && (!form.code || !form.name)}>
            {role ? 'Save' : 'Create role'}
          </Button>
        </>
      }
    >
      {!role && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <Field label="Name">{(id) => <Input id={id} placeholder="Exam coordinator" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, code: form.code || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') })} autoFocus />}</Field>
          <Field label="Code" hint="Lowercase, no spaces">{(id) => <Input id={id} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />}</Field>
        </div>
      )}
      <div className="space-y-4">
        {modules.map((m) => (
          <fieldset key={m}>
            <legend className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-text-3">{MODULE_LABEL[m] ?? m}</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {permissions
                .filter((p) => p.module === m)
                .map((p) => {
                  const allowed = held.has(p.code);
                  return (
                    <label key={p.code} className={cn('flex items-start gap-2.5 rounded-lg p-1.5 text-sm', allowed ? 'hover:bg-surface-2' : 'opacity-50')}>
                      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" disabled={!allowed} checked={chosen.includes(p.code)} onChange={(e) => setChosen((l) => (e.target.checked ? [...l, p.code] : l.filter((x) => x !== p.code)))} />
                      <span>
                        <span className="block text-[13.5px]">{p.description}</span>
                        <span className="block font-mono text-[11px] text-text-3">{p.code}</span>
                      </span>
                    </label>
                  );
                })}
            </div>
          </fieldset>
        ))}
      </div>
    </Dialog>
  );
}
