'use client';

import { BookOpen, Paperclip, Zap } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/components/app/context';
import { PageHeader } from '@/components/app/page';
import { SectionSelect } from '@/components/app/pickers';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { addDays, formatDate, relativeDay, todayLocal } from '@/lib/cn';
import { useApi } from '@/lib/query';
import type { Homework } from '@/lib/types';

export default function HomeworkOverviewPage() {
  const { term } = useApp();
  const [sectionId, setSectionId] = useState('');
  const today = todayLocal();
  const list = useApi<Homework[]>(`/homework?from=${addDays(today, -14)}&to=${addDays(today, 30)}${sectionId ? `&sectionId=${sectionId}` : ''}`);

  return (
    <>
      <PageHeader title={term.homework} description={`What teachers have set over the last two weeks and what is coming due`} actions={<SectionSelect value={sectionId} onChange={setSectionId} allLabel="All sections" className="w-56" />} />
      <Card>
        {list.isLoading ? (
          <Skeleton className="m-4 h-48" />
        ) : !list.data?.length ? (
          <EmptyState icon={BookOpen} title={`No ${term.homework.toLowerCase()} in this period`} description="Teachers post from the teacher app; families get one digest a day." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{term.homework}</Th>
                <Th>Section</Th>
                <Th>Teacher</Th>
                <Th>Due</Th>
                <Th>Reviewed</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((h) => {
                const c = typeof h.completion === 'object' && h.completion ? h.completion : { done: 0, late: 0, pending: 0 };
                return (
                  <Tr key={h.id} className={h.status === 'cancelled' ? 'opacity-50' : undefined}>
                    <Td>
                      <p className="flex items-center gap-2 font-medium">
                        {h.isUrgent && <Zap className="size-3.5 fill-warning text-warning" aria-label="Urgent" />}
                        {h.title}
                        {h.attachments.length > 0 && <Paperclip className="size-3.5 text-text-3" aria-label="Has attachments" />}
                      </p>
                      <p className="text-[12.5px] text-text-3">{h.subjectName}</p>
                    </Td>
                    <Td className="text-text-2">
                      {h.className} · {h.sectionName}
                    </Td>
                    <Td className="text-text-2">{h.teacherName}</Td>
                    <Td>
                      <Badge tone={h.dueDate < today ? 'neutral' : h.dueDate === today ? 'warning' : 'brand'}>{h.dueDate >= addDays(today, -1) && h.dueDate <= addDays(today, 1) ? relativeDay(h.dueDate) : formatDate(h.dueDate, { day: 'numeric', month: 'short' })}</Badge>
                    </Td>
                    <Td className="text-[12.5px] tabular-nums text-text-2">{h.status === 'cancelled' ? 'Cancelled' : `${c.done} done · ${c.late} late`}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
