'use client';

import { ArrowLeft, Cake, CalendarCheck2, HeartPulse, MessageCircle, MoreHorizontal, Pencil, Phone, Plus, Star, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';
import { useApp } from '@/components/app/context';
import { ATTENDANCE } from '@/components/app/status';
import { AddGuardianDialog, EditStudentSheet, EnrollDialog } from '@/components/app/student-actions';
import { Button, buttonStyles } from '@/components/ui/button';
import { Avatar, Badge, Card, CardBody, CardHeader, Skeleton } from '@/components/ui/card';
import { DropdownMenu, MenuItem, MenuSeparator } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { cn, formatDate, formatPhone, percent, todayLocal } from '@/lib/cn';
import { useApi, useMutate } from '@/lib/query';
import type { AttendanceStatus, StudentDetail } from '@/lib/types';

interface Register {
  students: { studentId: string; days: Record<string, string>; present: number; absent: number; late: number; leave: number; total: number; percent: number | null }[];
  days: string[];
}

const CODE_TO_STATUS: Record<string, AttendanceStatus> = { P: 'present', A: 'absent', L: 'late', H: 'half_day', LV: 'leave' };

export default function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { term, can } = useApp();
  const student = useApi<StudentDetail>(`/students/${id}`);
  const current = student.data?.enrollments.find((e) => e.isCurrentYear);
  const month = todayLocal().slice(0, 7);
  const register = useApi<Register>(current ? `/attendance/reports/register/${current.sectionId}?month=${month}` : null);
  const mine = register.data?.students.find((s) => s.studentId === id);
  const [dialog, setDialog] = useState<'edit' | 'enroll' | 'guardian' | null>(null);
  const guardianUpdate = useMutate(({ guardianId, ...body }: { guardianId: string; isPrimary?: true; whatsappOptIn?: boolean }) => api(`/students/${id}/guardians/${guardianId}`, { method: 'PATCH', body }), {
    invalidate: ['/students'],
    success: 'Guardian updated',
  });
  const guardianRemove = useMutate((guardianId: string) => api(`/students/${id}/guardians/${guardianId}`, { method: 'DELETE' }), { invalidate: ['/students'], success: 'Guardian removed' });

  if (student.isLoading || !student.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  const s = student.data;
  const manage = can('students.manage');

  return (
    <>
      <Link href="/admin/students" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-3 hover:text-text">
        <ArrowLeft className="size-4" /> All {term.student.toLowerCase()}s
      </Link>

      <Card className="overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-[#1e3a5f] via-[#2b5080] to-[#0f8b80]" aria-hidden />
        <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end">
          <Avatar name={s.name} size={84} className="-mt-10 ring-4 ring-surface" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{s.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-3">
              <span>Adm. no. {s.admissionNo}</span>
              {current ? (
                <span>
                  {current.className} · {current.sectionName}
                  {current.rollNo ? ` · Roll ${current.rollNo}` : ''}
                </span>
              ) : (
                <span className="text-warning">Not enrolled this year</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Badge tone={s.status === 'active' ? 'success' : 'neutral'} dot>
              {s.status === 'active' ? 'Active' : s.status}
            </Badge>
            {manage && (
              <>
                <Button variant="outline" size="sm" onClick={() => setDialog('enroll')}>
                  {current ? `Move ${term.section.toLowerCase()}` : 'Enrol'}
                </Button>
                <Button size="sm" onClick={() => setDialog('edit')}>
                  <Pencil className="size-4" /> Edit
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="This month’s attendance" description={formatDate(`${month}-01`, { month: 'long', year: 'numeric' })} action={<span className="text-2xl font-semibold tabular-nums">{percent(mine?.percent)}</span>} />
            <CardBody>
              {register.isLoading ? (
                <Skeleton className="h-24" />
              ) : !mine || mine.total === 0 ? (
                <p className="text-sm text-text-3">No attendance recorded this month yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-[repeat(16,minmax(0,1fr))]">
                    {register.data!.days.map((d) => {
                      const code = mine.days[d];
                      const status = code ? CODE_TO_STATUS[code] : undefined;
                      return (
                        <div
                          key={d}
                          title={`${formatDate(d)}${status ? `: ${ATTENDANCE[status].label}` : ''}`}
                          className={cn('flex aspect-square items-center justify-center rounded-lg text-[11px] font-semibold', status ? ATTENDANCE[status].cell : 'bg-surface-2 text-text-3')}
                        >
                          {Number(d.slice(8))}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3 text-[12.5px] text-text-2">
                    <span>{mine.present} present</span>
                    <span className="text-danger">{mine.absent} absent</span>
                    <span className="text-warning">{mine.late} late</span>
                    <span>{mine.leave} on leave</span>
                  </div>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Enrollment history" />
            <CardBody className="pt-3">
              <ol className="relative space-y-4 border-l border-border pl-5">
                {s.enrollments.length === 0 && <p className="text-sm text-text-3">Not enrolled in a {term.section.toLowerCase()} yet.</p>}
                {[...s.enrollments].reverse().map((e) => (
                  <li key={e.academicYear} className="relative">
                    <span className={cn('absolute -left-[26px] top-1 size-3 rounded-full ring-4 ring-surface', e.isCurrentYear ? 'bg-accent' : 'bg-border-strong')} />
                    <p className="text-sm font-medium">
                      {e.className} · {e.sectionName} {e.isCurrentYear && <Badge tone="accent">Current</Badge>}
                    </p>
                    <p className="text-[12.5px] text-text-3">
                      {e.academicYear}
                      {e.rollNo ? ` · Roll ${e.rollNo}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Parents and guardians"
              action={
                manage && (
                  <Button variant="ghost" size="sm" onClick={() => setDialog('guardian')}>
                    <Plus className="size-4" /> Add
                  </Button>
                )
              }
            />
            <CardBody className="space-y-4 pt-3">
              {s.guardians.map((g) => (
                <div key={g.guardianId} className="flex items-start gap-3">
                  <Avatar name={g.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {g.name} {g.isPrimary && <Star className="size-3.5 fill-warning text-warning" aria-label="Primary contact" />}
                    </p>
                    <p className="text-[12.5px] capitalize text-text-3">{g.relation}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <a href={`tel:${g.phone}`} className={buttonStyles({ variant: 'outline', size: 'sm' })}>
                        <Phone className="size-3.5" /> {formatPhone(g.phone)}
                      </a>
                      <Badge tone={g.whatsappOptIn ? 'success' : 'neutral'}>
                        <MessageCircle className="size-3" /> {g.whatsappOptIn ? 'WhatsApp' : 'SMS only'}
                      </Badge>
                      <Badge>{g.language === 'hi' ? 'हिन्दी' : 'English'}</Badge>
                    </div>
                  </div>
                  {manage && (
                    <DropdownMenu
                      trigger={
                        <button className="rounded-lg p-1.5 text-text-3 hover:bg-surface-2 hover:text-text" aria-label={`Options for ${g.name}`}>
                          <MoreHorizontal className="size-4" />
                        </button>
                      }
                    >
                      {!g.isPrimary && (
                        <MenuItem onSelect={() => guardianUpdate.mutate({ guardianId: g.guardianId, isPrimary: true })}>
                          <Star className="size-4" /> Make primary contact
                        </MenuItem>
                      )}
                      <MenuItem onSelect={() => guardianUpdate.mutate({ guardianId: g.guardianId, whatsappOptIn: !g.whatsappOptIn })}>
                        <MessageCircle className="size-4" /> {g.whatsappOptIn ? 'Switch to SMS' : 'Record WhatsApp consent'}
                      </MenuItem>
                      {s.guardians.length > 1 && (
                        <>
                          <MenuSeparator />
                          <MenuItem danger onSelect={() => guardianRemove.mutate(g.guardianId)}>
                            <Trash2 className="size-4" /> Remove
                          </MenuItem>
                        </>
                      )}
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <CardBody className="space-y-3 pt-3 text-sm">
              <p className="flex items-center gap-3">
                <Cake className="size-4 text-text-3" /> {s.dob ? formatDate(s.dob) : 'Date of birth not recorded'}
              </p>
              <p className="flex items-center gap-3">
                <CalendarCheck2 className="size-4 text-text-3" /> Admitted {formatDate(s.admissionDate)}
              </p>
              {s.medicalNotes && (
                <p className="flex items-start gap-3 rounded-xl bg-warning-soft p-3 text-warning">
                  <HeartPulse className="mt-0.5 size-4 shrink-0" /> {s.medicalNotes}
                </p>
              )}
            </CardBody>
          </Card>

          {s.siblings.length > 0 && (
            <Card>
              <CardHeader title="Siblings" description="Linked through a shared parent" />
              <CardBody className="space-y-2 pt-3">
                {s.siblings.map((sib) => (
                  <Link key={sib.id} href={`/admin/students/${sib.id}`} className="flex items-center gap-3 rounded-xl p-2 -mx-2 hover:bg-surface-2">
                    <Avatar name={sib.name} size={32} />
                    <span className="text-sm font-medium">{sib.name}</span>
                    <Users className="ml-auto size-4 text-text-3" />
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {dialog === 'edit' && <EditStudentSheet student={s} onClose={() => setDialog(null)} />}
      {dialog === 'enroll' && <EnrollDialog student={s} onClose={() => setDialog(null)} />}
      {dialog === 'guardian' && <AddGuardianDialog student={s} onClose={() => setDialog(null)} />}
    </>
  );
}
