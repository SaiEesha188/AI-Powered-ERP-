'use client';

import { type FormEvent, useState } from 'react';
import { SectionSelect } from '@/components/app/pickers';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Dialog, Sheet } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useMutate } from '@/lib/query';
import type { StudentDetail } from '@/lib/types';
import { useApp } from './context';

const invalidate = ['/students', '/attendance', '/dashboards'];

export function EditStudentSheet({ student, onClose }: { student: StudentDetail; onClose: () => void }) {
  const { term } = useApp();
  const [form, setForm] = useState({
    name: student.name,
    admissionNo: student.admissionNo,
    dob: student.dob ?? '',
    gender: student.gender ?? '',
    admissionDate: student.admissionDate ?? '',
    medicalNotes: student.medicalNotes ?? '',
    status: student.status,
  });
  const save = useMutate((body: object) => api(`/students/${student.id}`, { method: 'PATCH', body }), { invalidate, success: 'Saved', onSuccess: onClose });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({
      name: form.name,
      admissionNo: form.admissionNo,
      dob: form.dob || null,
      gender: form.gender || null,
      admissionDate: form.admissionDate || null,
      medicalNotes: form.medicalNotes || null,
      status: form.status,
    });
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Edit ${term.student.toLowerCase()}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-student" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="edit-student" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2">{(id) => <Input id={id} value={form.name} onChange={set('name')} required minLength={2} />}</Field>
        <Field label="Admission number">{(id) => <Input id={id} value={form.admissionNo} onChange={set('admissionNo')} required />}</Field>
        <Field label="Status">
          {(id) => (
            <Select id={id} value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="left">Left</option>
              <option value="alumni">Alumni</option>
            </Select>
          )}
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
        <Field label="Admission date">{(id) => <Input id={id} type="date" value={form.admissionDate} onChange={set('admissionDate')} />}</Field>
        <Field label="Medical notes" hint="Allergies, conditions teachers should know about" className="sm:col-span-2">
          {(id) => <Textarea id={id} value={form.medicalNotes} onChange={set('medicalNotes')} />}
        </Field>
      </form>
    </Sheet>
  );
}

export function EnrollDialog({ student, onClose }: { student: StudentDetail; onClose: () => void }) {
  const { term } = useApp();
  const current = student.enrollments.find((e) => e.isCurrentYear);
  const [sectionId, setSectionId] = useState(current?.sectionId ?? '');
  const [rollNo, setRollNo] = useState(current?.rollNo ? String(current.rollNo) : '');
  const save = useMutate((body: object) => api(`/students/${student.id}/enrollment`, { method: 'PUT', body }), { invalidate, success: `${term.section} updated`, onSuccess: onClose });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={current ? `Move ${student.name.split(' ')[0]}` : `Enrol ${student.name.split(' ')[0]}`}
      description="In the current academic year"
      footer={
        <Button onClick={() => save.mutate({ sectionId, rollNo: rollNo ? Number(rollNo) : null })} loading={save.isPending} disabled={!sectionId}>
          Save
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Field label={`${term.class} and ${term.section.toLowerCase()}`}>{(id) => <SectionSelect id={id} value={sectionId} onChange={setSectionId} />}</Field>
        <Field label="Roll number">{(id) => <Input id={id} inputMode="numeric" value={rollNo} onChange={(e) => setRollNo(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}

export function AddGuardianDialog({ student, onClose }: { student: StudentDetail; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', relation: 'father', whatsappOptIn: true, language: 'en', isPrimary: false });
  const add = useMutate((body: object) => api(`/students/${student.id}/guardians`, { method: 'POST', body }), { invalidate, success: 'Guardian added', onSuccess: onClose });
  function submit(e: FormEvent) {
    e.preventDefault();
    const digits = form.phone.replace(/[^\d+]/g, '');
    add.mutate({ ...form, phone: /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : digits });
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a guardian"
      description="They can sign in to the parent app with this number."
      footer={
        <Button type="submit" form="add-guardian" loading={add.isPending}>
          Add
        </Button>
      }
    >
      <form id="add-guardian" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} autoFocus />}</Field>
        <Field label="Mobile">{(id) => <Input id={id} inputMode="tel" placeholder="98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />}</Field>
        <Field label="Relation">
          {(id) => (
            <Select id={id} value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })}>
              <option value="mother">Mother</option>
              <option value="father">Father</option>
              <option value="guardian">Guardian</option>
              <option value="other">Other</option>
            </Select>
          )}
        </Field>
        <Field label="Message language">
          {(id) => (
            <Select id={id} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi)</option>
            </Select>
          )}
        </Field>
        <div className="space-y-3 sm:col-span-2">
          <Checkbox label="Agreed to WhatsApp messages" checked={form.whatsappOptIn} onChange={(e) => setForm({ ...form, whatsappOptIn: e.target.checked })} />
          <Checkbox label="Make primary contact" checked={form.isPrimary} onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })} />
        </div>
      </form>
    </Dialog>
  );
}
