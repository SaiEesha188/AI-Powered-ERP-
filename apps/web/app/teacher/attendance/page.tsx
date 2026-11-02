'use client';

import { CheckCircle2, ChevronRight, ClipboardCheck } from 'lucide-react';
import { ListCard } from '@/components/app/mobile-shell';
import { EmptyState, Skeleton } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { useApi } from '@/lib/query';

interface TeacherDashboard {
  sections: { id: string; name: string; className: string; attendanceMarkedToday: boolean; isClassTeacher: boolean }[];
}

export default function TeacherAttendanceList() {
  const d = useApi<TeacherDashboard>('/dashboards/teacher');
  if (!d.data) return <Skeleton className="h-48 rounded-2xl" />;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Attendance</h1>
      {d.data.sections.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No sections assigned" />
      ) : (
        <ul className="space-y-2.5">
          {d.data.sections.map((s) => (
            <li key={s.id}>
              <ListCard href={`/teacher/attendance/${s.id}`} className="flex items-center gap-3">
                <span className={cn('inline-flex size-12 items-center justify-center rounded-2xl text-lg font-semibold', s.attendanceMarkedToday ? 'bg-success-soft text-success' : 'bg-brand-soft text-brand')}>{s.name}</span>
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold">
                    {s.className} · {s.name}
                  </span>
                  <span className={cn('block text-[13px]', s.attendanceMarkedToday ? 'text-success' : 'text-text-3')}>{s.attendanceMarkedToday ? 'Taken today' : 'Not taken yet'}</span>
                </span>
                {s.attendanceMarkedToday ? <CheckCircle2 className="size-6 text-success" /> : <ChevronRight className="size-5 text-text-3" />}
              </ListCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
