'use client';

import { ArrowLeft, Share2 } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { toast } from 'sonner';
import { useChild } from '@/components/app/child';
import { useApp } from '@/components/app/context';
import { ReportCardView } from '@/components/app/report-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { useApi } from '@/lib/query';
import type { ReportCardDetail } from '@/lib/types';

export default function ParentReportCard({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = use(params);
  const { child } = useChild();
  const { institute } = useApp();
  const card = useApi<ReportCardDetail>(`/family/children/${child.id}/report-cards/${cardId}`);

  async function share() {
    const text = card.data ? `${card.data.studentName} · ${card.data.examName}: ${card.data.data.percent ?? '—'}% (Grade ${card.data.data.grade ?? '—'})` : '';
    try {
      if (navigator.share) await navigator.share({ title: card.data?.examName, text, url: location.href });
      else {
        await navigator.clipboard.writeText(`${text}\n${location.href}`);
        toast.success('Copied');
      }
    } catch {
      // the share sheet was dismissed
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/parent/results" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-3">
          <ArrowLeft className="size-4" /> Results
        </Link>
        <Button variant="ghost" size="sm" onClick={share}>
          <Share2 className="size-4" /> Share
        </Button>
      </div>
      {card.data ? <ReportCardView card={card.data} instituteName={institute.name} compact /> : <Skeleton className="h-96 rounded-2xl" />}
      <p className="px-1 text-[12px] text-text-3">Questions about a mark? Speak to the class teacher at the next parent-teacher meeting or message the office.</p>
    </div>
  );
}
