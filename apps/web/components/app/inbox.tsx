'use client';

import { BellRing, CheckCircle2, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { AttachmentList } from '@/components/app/attachments';
import { ListCard } from '@/components/app/mobile-shell';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { Circular } from '@/lib/types';

export function useUnread() {
  const inbox = useApi<Circular[]>('/inbox', { refetchInterval: 60_000 });
  return (inbox.data ?? []).filter((c) => !c.readAt).length;
}

/** Circulars for the signed-in person. Opening one marks it read; consent forms need "I agree". */
export function Inbox() {
  const inbox = useApi<Circular[]>('/inbox');
  const [open, setOpen] = useState<string | null>(null);
  const read = useMutate((id: string) => api(`/inbox/${id}/read`, { method: 'POST' }), { invalidate: ['/inbox'] });
  const agree = useMutate((id: string) => api(`/inbox/${id}/acknowledge`, { method: 'POST' }), { invalidate: ['/inbox'], success: 'Thank you — the school has your agreement' });

  if (inbox.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (!inbox.data?.length) return <EmptyState icon={BellRing} title="No notices yet" description="Circulars from the school will appear here." />;

  return (
    <ul className="space-y-3">
      {inbox.data.map((c) => {
        const expanded = open === c.id;
        const needsAgree = c.requiresAck && !c.acknowledgedAt;
        return (
          <li key={c.id}>
            <ListCard className={cn(!c.readAt && 'border-brand/30 bg-brand-soft/30')}>
              <button
                className="flex w-full items-start gap-3 text-left"
                onClick={() => {
                  setOpen(expanded ? null : c.id);
                  if (!c.readAt) read.mutate(c.id);
                }}
                aria-expanded={expanded}
              >
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', c.readAt ? 'bg-transparent' : 'bg-brand')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {needsAgree && <Badge tone="warning">Needs your reply</Badge>}
                    {c.type === 'notice' && <Badge>Notice</Badge>}
                    <span className="text-[12px] text-text-3">{formatDate(c.publishedAt, { day: 'numeric', month: 'short' })}</span>
                  </span>
                  <span className={cn('mt-1 block text-[15px] leading-snug', c.readAt ? 'font-medium' : 'font-semibold')}>{c.title}</span>
                  {!expanded && <span className="mt-0.5 line-clamp-2 block text-[13px] text-text-3">{c.body}</span>}
                </span>
                <ChevronDown className={cn('mt-1 size-5 shrink-0 text-text-3 transition-transform', expanded && 'rotate-180')} />
              </button>
              {expanded && (
                <div className="mt-3 border-t border-border pt-3 animate-in">
                  <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-text-2">{c.body}</p>
                  {c.attachments && c.attachments.length > 0 && (
                    <div className="mt-3">
                      <AttachmentList files={c.attachments} />
                    </div>
                  )}
                  {c.requiresAck &&
                    (c.acknowledgedAt ? (
                      <p className="mt-4 flex items-center gap-2 text-sm font-medium text-success">
                        <CheckCircle2 className="size-5" /> You agreed on {formatDate(c.acknowledgedAt, { day: 'numeric', month: 'short' })}
                      </p>
                    ) : (
                      <Button size="lg" className="mt-4 w-full" onClick={() => agree.mutate(c.id)} loading={agree.isPending}>
                        <CheckCircle2 className="size-5" /> I agree
                      </Button>
                    ))}
                </div>
              )}
            </ListCard>
          </li>
        );
      })}
    </ul>
  );
}
