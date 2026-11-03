'use client';

import { UserCheck } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { addDays, formatDate } from '@/lib/cn';
import { useApi } from '@/lib/query';
import type { TrendPoint } from '@/lib/types';

/** Attendance percentage per school day over the last two weeks. */
export function AttendanceTrend({ to }: { to: string }) {
  const trend = useApi<TrendPoint[]>(`/attendance/reports/trend?from=${addDays(to, -13)}&to=${to}`);
  const data = (trend.data ?? []).map((t) => ({ ...t, label: formatDate(t.date, { day: 'numeric', month: 'short' }) }));
  return (
    <Card>
      <CardHeader title="Attendance, last 14 days" description="Share of marked students present each school day" />
      <CardBody className="h-56 pt-2">
        {trend.isLoading ? (
          <Skeleton className="h-full" />
        ) : data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 12 }} minTickGap={24} />
              <YAxis domain={[0, 100]} ticks={[0, 50, 75, 100]} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                formatter={(v) => [`${v}%`, 'Present']}
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', fontSize: 13 }}
              />
              <Area type="monotone" dataKey="percent" stroke="var(--accent)" strokeWidth={2.5} fill="url(#trendFill)" dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState icon={UserCheck} title="Not enough days yet" description="The trend appears after two school days of attendance." className="py-4" />
        )}
      </CardBody>
    </Card>
  );
}
