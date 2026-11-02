'use client';

import { ArrowLeft, Send, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';
import { AttachmentPicker } from '@/components/app/attachments';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';
import { api } from '@/lib/api';
import { addDays, cn, formatDate, todayLocal } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { ClassRow, FileLink } from '@/lib/types';

interface Teaching {
  sections: { id: string; name: string; classId: string; className: string; isClassTeacher: boolean; mySubjects: { id: string; name: string }[] }[];
}

export default function NewHomework() {
  const router = useRouter();
  const teaching = useApi<Teaching>('/me/teaching');
  const classes = useApi<ClassRow[]>('/classes');
  const today = todayLocal();
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [dueDate, setDueDate] = useState(addDays(today, 1));
  const [urgent, setUrgent] = useState(false);
  const [files, setFiles] = useState<FileLink[]>([]);

  const sections = teaching.data?.sections ?? [];

  /** Subjects the teacher may set in every chosen section: their own, or any subject where they are class teacher. */
  const subjects = useMemo(() => {
    const chosen = sections.filter((s) => sectionIds.includes(s.id));
    if (!chosen.length) return [];
    const allowedIn = (s: (typeof sections)[number]) => {
      if (!s.isClassTeacher) return s.mySubjects;
      const cls = classes.data?.find((c) => c.id === s.classId);
      return cls?.subjects.map((x) => ({ id: x.id, name: x.name })) ?? s.mySubjects;
    };
    const [first, ...rest] = chosen.map(allowedIn);
    return (first ?? []).filter((sub) => rest.every((list) => list.some((x) => x.id === sub.id)));
  }, [sections, sectionIds, classes.data]);

  const post = useMutate((body: object) => api<{ id: string; dueDateShifted: boolean; dueDate: string }[]>('/homework', { method: 'POST', body }), {
    invalidate: ['/homework', '/dashboards'],
    success: (r) =>
      r[0]?.dueDateShifted
        ? `Posted. ${formatDate(dueDate, { day: 'numeric', month: 'short' })} is a holiday, so it is due ${formatDate(r[0].dueDate, { day: 'numeric', month: 'short' })}.`
        : urgent
          ? 'Posted. Parents are being told now.'
          : 'Posted. Parents get it in today’s digest.',
    onSuccess: () => router.push('/teacher/homework'),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    post.mutate({ sectionIds, subjectId, title, instructions: instructions || undefined, dueDate, isUrgent: urgent, fileIds: files.map((f) => f.id) });
  }

  if (teaching.isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  const dueChips = [
    { label: 'Tomorrow', value: addDays(today, 1) },
    { label: 'In 2 days', value: addDays(today, 2) },
    { label: 'In a week', value: addDays(today, 7) },
  ];

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/teacher/homework" className="-ml-2 rounded-xl p-2 text-text-2 active:bg-surface-2" aria-label="Back">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">New homework</h1>
      </div>

      <Field label="For">
        {() => (
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => {
              const on = sectionIds.includes(s.id);
              return (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => (setSectionIds((l) => (on ? l.filter((x) => x !== s.id) : [...l, s.id])), setSubjectId(''))}
                  aria-pressed={on}
                  className={cn('h-11 rounded-xl border px-4 text-[14px] font-semibold transition-colors', on ? 'border-brand bg-brand text-on-brand' : 'border-border bg-surface active:bg-surface-2')}
                >
                  {s.className} · {s.name}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      {sectionIds.length > 0 && (
        <Field label="Subject" error={subjects.length === 0 ? 'You don’t teach a common subject in all the chosen sections' : undefined}>
          {() => (
            <div className="flex flex-wrap gap-2">
              {subjects.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setSubjectId(s.id)}
                  aria-pressed={subjectId === s.id}
                  className={cn('h-10 rounded-full border px-4 text-[13.5px] font-medium transition-colors', subjectId === s.id ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface')}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </Field>
      )}

      <Field label="What to do">{(id) => <Input id={id} className="h-12 text-[15px]" placeholder="Exercise 3.2, questions 1–10" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} />}</Field>
      <Field label="Instructions" hint="Optional">
        {(id) => <Textarea id={id} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Show working for each step." />}
      </Field>

      <Field label="Due">
        {(id) => (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {dueChips.map((c) => (
                <button
                  type="button"
                  key={c.label}
                  onClick={() => setDueDate(c.value)}
                  aria-pressed={dueDate === c.value}
                  className={cn('h-10 rounded-full border px-4 text-[13.5px] font-medium', dueDate === c.value ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-surface')}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <Input id={id} type="date" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </div>
        )}
      </Field>

      <Field label="Photo, worksheet or voice note">{() => <AttachmentPicker value={files} onChange={setFiles} camera />}</Field>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <Checkbox label="Urgent" description="Tell parents now instead of in the evening digest." checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
      </div>

      <Button type="submit" size="xl" className="w-full" loading={post.isPending} disabled={!sectionIds.length || !subjectId || !title}>
        {urgent ? <Zap className="size-5" /> : <Send className="size-5" />} Post homework
      </Button>
    </form>
  );
}
