'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, use } from 'react';
import { MarksGrid } from '@/components/app/marks-grid';
import { PageHeader } from '@/components/app/page';
import { sectionLabel, useSections } from '@/components/app/pickers';
import { Card, CardBody, Skeleton } from '@/components/ui/card';
import { useApi } from '@/lib/query';
import type { ExamDetail } from '@/lib/types';

function MarksPage({ examId }: { examId: string }) {
  const params = useSearchParams();
  const paperId = params.get('paperId') ?? '';
  const sectionId = params.get('sectionId') ?? '';
  const exam = useApi<ExamDetail>(`/exams/${examId}`);
  const section = useSections().data?.find((s) => s.id === sectionId);
  const paper = exam.data?.papers.find((p) => p.id === paperId);
  return (
    <>
      <Link href={`/admin/exams/${examId}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-3 hover:text-text">
        <ArrowLeft className="size-4" /> {exam.data?.name ?? 'Exam'}
      </Link>
      <PageHeader title={paper ? `${paper.subjectName} · ${section ? sectionLabel(section) : ''}` : 'Marks'} description={paper?.date ? `Paper on ${paper.date}` : undefined} />
      <Card className="max-w-3xl">
        <CardBody>{paperId && sectionId ? <MarksGrid paperId={paperId} sectionId={sectionId} /> : <p className="text-sm text-text-3">Choose a paper and section from the exam page.</p>}</CardBody>
      </Card>
    </>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <MarksPage examId={id} />
    </Suspense>
  );
}
