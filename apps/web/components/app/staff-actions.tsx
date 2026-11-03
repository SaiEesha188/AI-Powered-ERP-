'use client';

import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Sheet } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useMutate } from '@/lib/query';
import type { StaffRow } from '@/lib/types';

export function EditStaffSheet({ staff, onClose }: { staff: StaffRow; onClose: () => void }) {
  const [form, setForm] = useState({ designation: staff.designation, employeeCode: staff.employeeCode ?? '', joiningDate: staff.joiningDate ?? '', status: staff.status });
  const save = useMutate((body: object) => api(`/staff/${staff.id}`, { method: 'PATCH', body }), { invalidate: ['/staff', '/sections'], success: 'Saved', onSuccess: onClose });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ designation: form.designation, employeeCode: form.employeeCode || null, joiningDate: form.joiningDate || null, status: form.status });
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={staff.name}
      description="Marking someone as left is refused while they still have sections or subjects. Reassign those first."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-staff" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="edit-staff" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Designation" className="sm:col-span-2">{(id) => <Input id={id} value={form.designation} onChange={set('designation')} required minLength={2} />}</Field>
        <Field label="Employee code">{(id) => <Input id={id} value={form.employeeCode} onChange={set('employeeCode')} />}</Field>
        <Field label="Joining date">{(id) => <Input id={id} type="date" value={form.joiningDate} onChange={set('joiningDate')} />}</Field>
        <Field label="Status" className="sm:col-span-2">
          {(id) => (
            <Select id={id} value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="left">Left the institute</option>
            </Select>
          )}
        </Field>
      </form>
    </Sheet>
  );
}
