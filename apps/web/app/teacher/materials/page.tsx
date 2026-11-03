'use client';

import { ExternalLink, FileText, Library, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/components/app/context';
import { ListCard } from '@/components/app/mobile-shell';
import { ShareSheet } from '@/components/app/share-material';
import { Badge, EmptyState, Skeleton } from '@/components/ui/card';
import { api, fileUrl } from '@/lib/api';
import { cn, formatDate } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { ClassRow, Material } from '@/lib/types';

interface Teaching {
  sections: { id: string; name: string; classId: string; className: string; isClassTeacher: boolean; mySubjects: { id: string; name: string }[] }[];
}

const AUDIENCE = { everyone: 'Students & parents', students: 'Students', staff: 'Staff only' };

export default function TeacherMaterials() {
  const { me } = useApp();
  const teaching = useApi<Teaching>('/me/teaching');
  const classes = useApi<ClassRow[]>('/classes');
  const materials = useApi<Material[]>('/materials');
  const [open, setOpen] = useState(false);
  const remove = useMutate((id: string) => api(`/materials/${id}`, { method: 'DELETE' }), { invalidate: ['/materials'], success: 'Removed' });

  // Classes and subjects this teacher may share for: their subjects, or everything if class teacher.
  const limitTo = (teaching.data?.sections ?? []).reduce<{ classId: string; subjectIds: string[] }[]>((acc, s) => {
    const cls = classes.data?.find((c) => c.id === s.classId);
    const ids = s.isClassTeacher ? (cls?.subjects.map((x) => x.id) ?? []) : s.mySubjects.map((x) => x.id);
    const entry = acc.find((a) => a.classId === s.classId);
    if (entry) entry.subjectIds = [...new Set([...entry.subjectIds, ...ids])];
    else acc.push({ classId: s.classId, subjectIds: ids });
    return acc;
  }, []);
  const myClassIds = new Set(limitTo.map((l) => l.classId));
  const list = (materials.data ?? []).filter((m) => myClassIds.has(m.classId));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Study material</h1>
      {materials.isLoading || teaching.isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : list.length === 0 ? (
        <EmptyState icon={Library} title="Nothing shared yet" description="Share notes, worksheets, photos of the board or videos. Families get one daily message about new material." />
      ) : (
        <ul className="space-y-2.5">
          {list.map((m) => (
            <li key={m.id}>
              <ListCard className="flex items-center gap-3">
                <a href={m.type === 'file' && m.file ? fileUrl(m.file.url) : (m.url ?? '#')} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                  <span className={cn('inline-flex size-11 shrink-0 items-center justify-center rounded-xl', m.type === 'file' ? 'bg-brand-soft text-brand' : 'bg-accent-soft text-accent')}>
                    {m.type === 'file' ? <FileText className="size-5" /> : <ExternalLink className="size-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">{m.title}</span>
                    <span className="block truncate text-[12px] text-text-3">
                      {m.className} · {m.subjectName}
                      {m.chapter ? ` · ${m.chapter}` : ''} · {formatDate(m.createdAt, { day: 'numeric', month: 'short' })}
                    </span>
                    <Badge className="mt-1">{AUDIENCE[m.audience]}</Badge>
                  </span>
                </a>
                {m.createdBy === me.user.id && (
                  <button className="rounded-lg p-2 text-text-3 active:bg-danger-soft active:text-danger" onClick={() => remove.mutate(m.id)} aria-label={`Remove ${m.title}`}>
                    <Trash2 className="size-5" />
                  </button>
                )}
              </ListCard>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => setOpen(true)}
        disabled={!limitTo.length}
        className="fixed bottom-24 right-[max(1rem,calc(50vw-14rem+1rem))] z-30 inline-flex h-14 items-center gap-2 rounded-2xl bg-accent px-5 text-[15px] font-semibold text-white shadow-pop active:scale-95 disabled:opacity-50"
      >
        <Plus className="size-5" /> Share
      </button>
      {open && <ShareSheet classes={classes.data ?? []} limitTo={limitTo} onClose={() => setOpen(false)} />}
    </div>
  );
}
