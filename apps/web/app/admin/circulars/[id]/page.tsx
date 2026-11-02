'use client';

import { ArrowLeft, Check, CheckCheck, Eye, Send, X } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';
import { AttachmentList } from '@/components/app/attachments';
import { useApp } from '@/components/app/context';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardBody, CardHeader, Progress, Skeleton } from '@/components/ui/card';
import { Tabs } from '@/components/ui/overlay';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { Circular, FileLink } from '@/lib/types';

interface CircularDetail extends Circular {
  attachments: FileLink[];
  summary: { recipients: number; read: number; acknowledged: number };
  receipts: { userId: string; name: string; kind: string; readAt: string | null; acknowledgedAt: string | null }[];
}

export default function CircularDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can, me } = useApp();
  const circular = useApi<CircularDetail>(`/circulars/${id}`, { refetchInterval: 30_000 });
  const [filter, setFilter] = useState('all');
  const publish = useMutate(() => api(`/circulars/${id}/publish`, { method: 'POST' }), { invalidate: ['/circulars'], success: 'Published' });
  const decide = useMutate((decision: 'approve' | 'reject') => api(`/circulars/${id}/decision`, { method: 'POST', body: { decision } }), { invalidate: ['/circulars', '/dashboards'], success: 'Updated' });

  if (!circular.data) return <Skeleton className="h-96" />;
  const c = circular.data;
  const rows = c.receipts.filter((r) => (filter === 'unread' ? !r.readAt : filter === 'pending' ? !r.acknowledgedAt : true));

  return (
    <>
      <Link href="/admin/circulars" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-3 hover:text-text">
        <ArrowLeft className="size-4" /> Circulars
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={c.status === 'published' ? 'success' : c.status === 'pending_approval' ? 'warning' : 'neutral'}>{c.status.replace('_', ' ')}</Badge>
              {c.requiresAck && <Badge tone="accent">Needs “I agree”</Badge>}
              <span className="text-[12.5px] text-text-3">{c.publishedAt ? `Published ${formatDate(c.publishedAt)} at ${formatTime(c.publishedAt)}` : `Created ${formatDate(c.createdAt)}`}</span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">{c.title}</h1>
            <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-text-2">{c.body}</p>
            {c.attachments.length > 0 && (
              <div className="mt-6">
                <AttachmentList files={c.attachments} />
              </div>
            )}
            {c.status === 'draft' && (c.createdBy === me.user.id || can('comms.approve')) && (
              <Button className="mt-6" onClick={() => publish.mutate(undefined)} loading={publish.isPending}>
                <Send className="size-4" /> Publish now
              </Button>
            )}
            {c.status === 'pending_approval' && can('comms.approve') && (
              <div className="mt-6 flex gap-2">
                <Button variant="outline" onClick={() => decide.mutate('reject')}>
                  <X className="size-4" /> Send back
                </Button>
                <Button onClick={() => decide.mutate('approve')} loading={decide.isPending}>
                  <Check className="size-4" /> Approve and send
                </Button>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="self-start">
          <CardHeader title="Reach" description={`${c.summary.recipients} recipients`} />
          <CardBody className="space-y-4">
            <div>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="flex items-center gap-2 text-text-2">
                  <Eye className="size-4" /> Read
                </span>
                <span className="font-semibold tabular-nums">
                  {c.summary.read}/{c.summary.recipients}
                </span>
              </div>
              <Progress value={c.summary.recipients ? (c.summary.read / c.summary.recipients) * 100 : 0} tone="accent" />
            </div>
            {c.requiresAck && (
              <div>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="flex items-center gap-2 text-text-2">
                    <CheckCheck className="size-4" /> Agreed
                  </span>
                  <span className="font-semibold tabular-nums">
                    {c.summary.acknowledged}/{c.summary.recipients}
                  </span>
                </div>
                <Progress value={c.summary.recipients ? (c.summary.acknowledged / c.summary.recipients) * 100 : 0} tone="success" />
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {c.receipts.length > 0 && (
        <Card className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <h2 className="text-[15px] font-semibold">Recipients</h2>
            <Tabs
              value={filter}
              onValueChange={setFilter}
              tabs={[
                { value: 'all', label: 'All' },
                { value: 'unread', label: 'Not read' },
                ...(c.requiresAck ? [{ value: 'pending', label: 'Not agreed' }] : []),
              ]}
            />
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Read</Th>
                {c.requiresAck && <Th>Agreed</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.userId}>
                  <Td>
                    <span className="flex items-center gap-3 font-medium">
                      <Avatar name={r.name} size={30} /> {r.name}
                    </span>
                  </Td>
                  <Td className="capitalize text-text-2">{r.kind}</Td>
                  <Td>{r.readAt ? <Badge tone="success">{formatTime(r.readAt)}</Badge> : <Badge>Not yet</Badge>}</Td>
                  {c.requiresAck && <Td>{r.acknowledgedAt ? <Badge tone="success">Agreed</Badge> : <Badge tone="warning">Waiting</Badge>}</Td>}
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
