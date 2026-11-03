'use client';

import { ExternalLink, FileText, Library, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/components/app/context';
import { PageHeader } from '@/components/app/page';
import { ShareSheet } from '@/components/app/share-material';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { api, fileUrl } from '@/lib/api';
import { cn, formatDate } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { ClassRow, Material } from '@/lib/types';

const AUDIENCE = {
  everyone: { label: 'Students & parents', tone: 'success' as const },
  students: { label: 'Students only', tone: 'info' as const },
  staff: { label: 'Staff only', tone: 'neutral' as const },
};

export default function MaterialsPage() {
  const { can, term } = useApp();
  const classes = useApi<ClassRow[]>('/classes');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const params = new URLSearchParams();
  if (classId) params.set('classId', classId);
  if (subjectId) params.set('subjectId', subjectId);
  const list = useApi<Material[]>(`/materials?${params}`);
  const [open, setOpen] = useState(false);
  const remove = useMutate((id: string) => api(`/materials/${id}`, { method: 'DELETE' }), { invalidate: ['/materials'], success: 'Removed' });
  const subjects = classes.data?.find((c) => c.id === classId)?.subjects ?? [];

  const byChapter = new Map<string, Material[]>();
  for (const m of list.data ?? []) {
    const key = `${m.className} · ${m.subjectName}${m.chapter ? ` · ${m.chapter}` : ''}`;
    byChapter.set(key, [...(byChapter.get(key) ?? []), m]);
  }

  return (
    <>
      <PageHeader
        title="Learning materials"
        description="Notes, worksheets, videos and links, organised by class, subject and chapter. Families hear about new material in a daily batch."
        actions={
          can('materials.manage') && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Share material
            </Button>
          )
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
          <Select value={classId} onChange={(e) => (setClassId(e.target.value), setSubjectId(''))} className="sm:w-56" aria-label={term.class}>
            <option value="">All {term.class.toLowerCase()}es</option>
            {(classes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="sm:w-56" aria-label="Subject" disabled={!classId}>
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        {list.isLoading ? (
          <Skeleton className="m-4 h-48" />
        ) : !list.data?.length ? (
          <EmptyState icon={Library} title="No material yet" description="Teachers share from their app; the office can add material for any class here." />
        ) : (
          <div className="divide-y divide-border">
            {[...byChapter.entries()].map(([key, items]) => (
              <section key={key} className="p-5">
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-text-3">{key}</h2>
                <ul className="grid gap-2 md:grid-cols-2">
                  {items.map((m) => (
                    <li key={m.id} className="group flex items-center gap-3 rounded-xl border border-border p-3">
                      <span className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-xl', m.type === 'file' ? 'bg-brand-soft text-brand' : 'bg-accent-soft text-accent')}>
                        {m.type === 'file' ? <FileText className="size-5" /> : <ExternalLink className="size-5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <a href={m.type === 'file' && m.file ? fileUrl(m.file.url) : (m.url ?? '#')} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:text-brand">
                          {m.title}
                        </a>
                        <p className="truncate text-[12px] text-text-3">
                          {m.createdByName} · {formatDate(m.createdAt, { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <Badge tone={AUDIENCE[m.audience].tone}>{AUDIENCE[m.audience].label}</Badge>
                      {can('materials.manage') && (
                        <button className="rounded-lg p-1.5 text-text-3 opacity-0 hover:bg-danger-soft hover:text-danger group-hover:opacity-100 focus:opacity-100" onClick={() => remove.mutate(m.id)} aria-label={`Remove ${m.title}`}>
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
      {open && <ShareSheet classes={classes.data ?? []} onClose={() => setOpen(false)} />}
    </>
  );
}
