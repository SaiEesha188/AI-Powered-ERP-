'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, use } from 'react';
import { MarksGrid } from '@/components/app/marks-grid';
import { Skeleton } from '@/components/ui/card';
import { formatDate } from '@/lib/cn';
import { useApi } from '@/lib/query';
import type { MarksTask } from '@/lib/types';

function EnterMarks({ paperId }: { paperId: string }) {
  const router = useRouter();
  const sectionId = useSearchParams().get('sectionId') ?? '';
  const task = useApi<MarksTask[]>('/exams/my-tasks').data?.find((t) => t.paperId === paperId && t.sectionId === sectionId);
  return (
    <div className="space-y-4">
      <Link href="/teacher/marks" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-3">
        <ArrowLeft className="size-4" /> Marks
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{task ? task.subjectName : 'Enter marks'}</h1>
        {task && (
          <p className="text-[13.5px] text-text-3">
            {task.examName} · {task.className} · {task.sectionName}
            {task.date ? ` · ${formatDate(task.date, { day: 'numeric', month: 'short' })}` : ''}
          </p>
        )}
      </div>
      {sectionId ? <MarksGrid paperId={paperId} sectionId={sectionId} compact onSaved={() => router.push('/teacher/marks')} /> : <p className="text-sm text-text-3">Open this paper from the Marks tab.</p>}
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <EnterMarks paperId={paperId} />
    </Suspense>
  );
}
