'use client';

import { ChevronDown, History } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/app/page';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { cn, formatDate, formatTime } from '@/lib/cn';
import { useApi } from '@/lib/query';
import type { AuditEntry, UserRow } from '@/lib/types';
import { useInfiniteQuery } from '@tanstack/react-query';

const ENTITIES = ['', 'student', 'staff', 'attendance_session', 'homework', 'circular', 'calendar_event', 'institute', 'role', 'user', 'report', 'material'];

const ACTION_TONE = (action: string) => (action.includes('delete') || action.includes('cancel') || action.includes('reject') ? 'danger' : action.includes('create') || action.includes('admit') || action.includes('approve') ? 'success' : 'brand');

export default function AuditPage() {
  const [entity, setEntity] = useState('');
  const users = useApi<UserRow[]>('/users');
  const pages = useInfiniteQuery({
    queryKey: ['/audit-logs', entity],
    queryFn: ({ pageParam }) => api<AuditEntry[]>(`/audit-logs?limit=50${entity ? `&entity=${entity}` : ''}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => (last.length === 50 ? last[last.length - 1]!.at : undefined),
  });
  const [open, setOpen] = useState<string | null>(null);
  const rows = pages.data?.pages.flat() ?? [];
  const who = (id: string | null) => users.data?.find((u) => u.id === id)?.name ?? (id ? 'Someone' : 'System');

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change: who made it, when, and what it looked like before and after. Entries cannot be edited or deleted."
        actions={
          <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="w-52" aria-label="Filter by record type">
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e ? e.replace('_', ' ') : 'All records'}
              </option>
            ))}
          </Select>
        }
      />
      <Card>
        {pages.isLoading ? (
          <Skeleton className="m-4 h-64" />
        ) : rows.length === 0 ? (
          <EmptyState icon={History} title="No entries" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((e) => {
              const expanded = open === e.id;
              return (
                <li key={e.id}>
                  <button className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-2/50" onClick={() => setOpen(expanded ? null : e.id)} aria-expanded={expanded}>
                    <Avatar name={who(e.actorId)} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{who(e.actorId)}</span>
                        <Badge tone={ACTION_TONE(e.action)}>{e.action}</Badge>
                      </span>
                      <span className="block text-[12px] text-text-3">
                        {formatDate(e.at, { day: 'numeric', month: 'short' })} at {formatTime(e.at)}
                        {e.entityId ? ` · ${e.entity} ${e.entityId.slice(0, 8)}` : ''}
                        {e.ip && !/^(::1|::ffff:127.0.0.1|127.0.0.1)$/.test(e.ip) ? ` · ${e.ip}` : ''}
                      </span>
                    </span>
                    <ChevronDown className={cn('size-4 text-text-3 transition-transform', expanded && 'rotate-180')} />
                  </button>
                  {expanded && (
                    <div className="grid gap-3 bg-surface-2/40 px-5 py-4 md:grid-cols-2 animate-in">
                      <JsonBlock label="Before" value={e.before} />
                      <JsonBlock label="After" value={e.after} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {pages.hasNextPage && (
          <div className="border-t border-border p-3 text-center">
            <Button variant="ghost" onClick={() => pages.fetchNextPage()} loading={pages.isFetchingNextPage}>
              Load older entries
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-3">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-xl border border-border bg-surface p-3 font-mono text-[12px] leading-relaxed text-text-2">{value === null || value === undefined ? '—' : JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}
