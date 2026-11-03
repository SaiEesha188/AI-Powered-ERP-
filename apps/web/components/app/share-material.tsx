'use client';

import { type FormEvent, useState } from 'react';
import { AttachmentPicker } from '@/components/app/attachments';
import { useApp } from '@/components/app/context';
import { sectionLabel, useSections } from '@/components/app/pickers';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Sheet } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useMutate } from '@/lib/query';
import type { ClassRow, FileLink } from '@/lib/types';

/** Also used by the teacher app, with the teacher's own classes. */
export function ShareSheet({ classes, onClose, limitTo }: { classes: ClassRow[]; onClose: () => void; limitTo?: { classId: string; subjectIds: string[] }[] }) {
  const { term } = useApp();
  const sections = useSections();
  const [form, setForm] = useState({ classId: '', subjectId: '', chapter: '', title: '', description: '', type: 'link', url: '', audience: 'everyone' });
  const [file, setFile] = useState<FileLink[]>([]);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const share = useMutate((body: object) => api('/materials', { method: 'POST', body }), {
    invalidate: ['/materials', '/family'],
    success: form.audience === 'staff' ? 'Shared with staff' : 'Shared — families will be told in today’s batch',
    onSuccess: onClose,
  });
  const allowedClasses = limitTo ? classes.filter((c) => limitTo.some((l) => l.classId === c.id)) : classes;
  const cls = allowedClasses.find((c) => c.id === form.classId);
  const allowedSubjects = (cls?.subjects ?? []).filter((s) => !limitTo || limitTo.find((l) => l.classId === form.classId)?.subjectIds.includes(s.id));
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    share.mutate({
      classId: form.classId,
      subjectId: form.subjectId,
      chapter: form.chapter || undefined,
      title: form.title,
      description: form.description || undefined,
      type: form.type,
      url: form.type === 'link' ? form.url : undefined,
      fileId: form.type === 'file' ? file[0]?.id : undefined,
      audience: form.audience,
      sectionIds,
    });
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Share material"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="material-form" loading={share.isPending} disabled={form.type === 'file' && !file.length}>
            Share
          </Button>
        </>
      }
    >
      <form id="material-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={term.class}>
          {(id) => (
            <Select id={id} value={form.classId} onChange={(e) => (setForm((f) => ({ ...f, classId: e.target.value, subjectId: '' })), setSectionIds([]))} required>
              <option value="">Choose…</option>
              {allowedClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Subject">
          {(id) => (
            <Select id={id} value={form.subjectId} onChange={set('subjectId')} required disabled={!form.classId}>
              <option value="">Choose…</option>
              {allowedSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Title" className="sm:col-span-2">
          {(id) => <Input id={id} placeholder="Chapter 3 notes" value={form.title} onChange={set('title')} required minLength={2} />}
        </Field>
        <Field label="Chapter" hint="Optional, for grouping">
          {(id) => <Input id={id} placeholder="Fractions" value={form.chapter} onChange={set('chapter')} />}
        </Field>
        <Field label="Who can see it">
          {(id) => (
            <Select id={id} value={form.audience} onChange={set('audience')}>
              <option value="everyone">Students and parents</option>
              <option value="students">Students only</option>
              <option value="staff">Staff only</option>
            </Select>
          )}
        </Field>
        <Field label="Type" className="sm:col-span-2">
          {() => (
            <div className="grid grid-cols-2 gap-2">
              {(['link', 'file'] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                  aria-pressed={form.type === t}
                  className={cn('rounded-xl border px-3 py-2.5 text-[13px] font-medium', form.type === t ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:bg-surface-2')}
                >
                  {t === 'link' ? 'Link (video, website)' : 'File (PDF, photo, audio)'}
                </button>
              ))}
            </div>
          )}
        </Field>
        {form.type === 'link' ? (
          <Field label="Link" className="sm:col-span-2">
            {(id) => <Input id={id} type="url" placeholder="https://" value={form.url} onChange={set('url')} required />}
          </Field>
        ) : (
          <Field label="File" className="sm:col-span-2">
            {() => <AttachmentPicker value={file} onChange={(f) => setFile(f.slice(-1))} camera />}
          </Field>
        )}
        <Field label="Description" hint="Optional" className="sm:col-span-2">
          {(id) => <Textarea id={id} className="min-h-20" value={form.description} onChange={set('description')} />}
        </Field>
        {form.classId && (
          <Field label={`Limit to ${term.section.toLowerCase()}s`} hint={`Leave all unticked for every ${term.section.toLowerCase()}`} className="sm:col-span-2">
            {() => (
              <div className="flex flex-wrap gap-3">
                {(sections.data ?? [])
                  .filter((s) => s.classId === form.classId)
                  .map((s) => (
                    <Checkbox key={s.id} label={sectionLabel(s)} checked={sectionIds.includes(s.id)} onChange={(e) => setSectionIds((l) => (e.target.checked ? [...l, s.id] : l.filter((x) => x !== s.id)))} />
                  ))}
              </div>
            )}
          </Field>
        )}
      </form>
    </Sheet>
  );
}
