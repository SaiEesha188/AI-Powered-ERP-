'use client';

import { MessageSquareText, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/components/app/context';
import { PageHeader } from '@/components/app/page';
import { DELIVERY, EVENT_LABEL } from '@/components/app/status';
import { Badge, Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { Tabs } from '@/components/ui/overlay';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { cn, formatDate, formatPhone, formatTime } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';

interface Delivery {
  id: string;
  eventType: string;
  recipientName: string;
  channel: 'whatsapp' | 'sms' | 'push';
  toAddress: string;
  status: string;
  attempts: number;
  error: string | null;
  scheduledFor: string;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
}

interface Rule {
  event: string;
  label: string;
  defaultTiming: 'immediate' | 'digest';
  enabled: boolean;
  timing: 'immediate' | 'digest';
}

export default function MessagesPage() {
  const [tab, setTab] = useState('log');
  return (
    <>
      <PageHeader title="Messages" description="Every WhatsApp and SMS the school sends, and the rules that send them." />
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'log', label: 'Delivery log' },
          { value: 'rules', label: 'Automations' },
        ]}
      />
      <div className="mt-4">{tab === 'log' ? <DeliveryLog /> : <Rules />}</div>
    </>
  );
}

function DeliveryLog() {
  const [status, setStatus] = useState('');
  const log = useApi<Delivery[]>(`/messages?limit=200${status ? `&status=${status}` : ''}`, { refetchInterval: 15_000 });
  return (
    <Card>
      <div className="flex items-center gap-3 border-b border-border p-4">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48" aria-label="Filter by status">
          <option value="">All statuses</option>
          {Object.entries(DELIVERY).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
        <p className="text-[13px] text-text-3">Updates every few seconds as WhatsApp reports delivery.</p>
      </div>
      {log.isLoading ? (
        <Skeleton className="m-4 h-48" />
      ) : !log.data?.length ? (
        <EmptyState icon={MessageSquareText} title="No messages yet" description="Absence alerts, homework digests and circulars appear here as they are sent." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Recipient</Th>
              <Th>Message</Th>
              <Th>Channel</Th>
              <Th>Status</Th>
              <Th>When</Th>
            </tr>
          </thead>
          <tbody>
            {log.data.map((d) => (
              <Tr key={d.id}>
                <Td>
                  <p className="font-medium">{d.recipientName}</p>
                  <p className="text-[12px] text-text-3">{formatPhone(d.toAddress)}</p>
                </Td>
                <Td className="text-text-2">{EVENT_LABEL[d.eventType] ?? d.eventType}</Td>
                <Td>
                  <Badge tone={d.channel === 'whatsapp' ? 'success' : 'neutral'}>
                    <Smartphone className="size-3" /> {d.channel === 'whatsapp' ? 'WhatsApp' : d.channel.toUpperCase()}
                  </Badge>
                </Td>
                <Td>
                  <Badge tone={DELIVERY[d.status]?.tone} dot>
                    {DELIVERY[d.status]?.label}
                  </Badge>
                  {d.error && <p className="mt-1 max-w-56 truncate text-[11.5px] text-danger" title={d.error}>{d.error}</p>}
                </Td>
                <Td className="whitespace-nowrap text-[12.5px] text-text-2">
                  {d.status === 'queued' ? `Scheduled ${formatTime(d.scheduledFor)}` : `${formatDate(d.sentAt ?? d.createdAt, { day: 'numeric', month: 'short' })}, ${formatTime(d.sentAt ?? d.createdAt)}`}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function Rules() {
  const { can, institute } = useApp();
  const rules = useApi<Rule[]>('/automation-rules');
  const update = useMutate(({ event, ...body }: { event: string; enabled: boolean; timing: string }) => api(`/automation-rules/${event}`, { method: 'PUT', body }), {
    invalidate: ['/automation-rules'],
    success: 'Automation updated',
  });
  const editable = can('institute.settings.manage');

  return (
    <Card>
      <CardHeader title="Automatic messages" description={`Digests go out daily at ${institute.settings.homeworkDigestTime}. Urgent homework skips the digest.`} />
      <CardBody className="divide-y divide-border pt-2">
        {(rules.data ?? []).map((r) => (
          <div key={r.event} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-sm font-semibold">{r.label}</p>
              <p className="text-[12.5px] text-text-3">{r.timing === 'digest' ? 'Batched into the daily digest' : 'Sent straight away'}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-lg bg-surface-2 p-0.5" role="group" aria-label={`${r.label} timing`}>
                {(['immediate', 'digest'] as const).map((t) => (
                  <button
                    key={t}
                    disabled={!editable || !r.enabled}
                    onClick={() => update.mutate({ event: r.event, enabled: r.enabled, timing: t })}
                    aria-pressed={r.timing === t}
                    className={cn('rounded-md px-3 py-1 text-[12.5px] font-medium capitalize text-text-3 disabled:opacity-50', r.timing === t && 'bg-surface text-text shadow-soft')}
                  >
                    {t === 'immediate' ? 'Instant' : 'Digest'}
                  </button>
                ))}
              </div>
              <button
                role="switch"
                aria-checked={r.enabled}
                aria-label={`${r.label} ${r.enabled ? 'on' : 'off'}`}
                disabled={!editable}
                onClick={() => update.mutate({ event: r.event, enabled: !r.enabled, timing: r.timing })}
                className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', r.enabled ? 'bg-accent' : 'bg-border-strong')}
              >
                <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform', r.enabled ? 'translate-x-5.5' : 'translate-x-0.5')} />
              </button>
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
