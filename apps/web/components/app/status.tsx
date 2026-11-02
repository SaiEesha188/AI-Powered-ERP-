import type { Tone } from '@/components/ui/card';
import type { AttendanceStatus } from '@/lib/types';

export const ATTENDANCE: Record<AttendanceStatus, { label: string; short: string; tone: Tone; cell: string }> = {
  present: { label: 'Present', short: 'P', tone: 'success', cell: 'bg-success-soft text-success' },
  absent: { label: 'Absent', short: 'A', tone: 'danger', cell: 'bg-danger-soft text-danger' },
  late: { label: 'Late', short: 'L', tone: 'warning', cell: 'bg-warning-soft text-warning' },
  half_day: { label: 'Half day', short: 'H', tone: 'info', cell: 'bg-info-soft text-info' },
  leave: { label: 'On leave', short: 'LV', tone: 'brand', cell: 'bg-brand-soft text-brand' },
};

export const EVENT_TYPE: Record<string, { label: string; tone: Tone; dot: string; chip: string }> = {
  holiday: { label: 'Holiday', tone: 'danger', dot: 'bg-danger', chip: 'bg-danger-soft text-danger' },
  half_day: { label: 'Half day', tone: 'warning', dot: 'bg-warning', chip: 'bg-warning-soft text-warning' },
  event: { label: 'Event', tone: 'brand', dot: 'bg-brand', chip: 'bg-brand-soft text-brand' },
  exam: { label: 'Exam', tone: 'info', dot: 'bg-info', chip: 'bg-info-soft text-info' },
  ptm: { label: 'PTM', tone: 'accent', dot: 'bg-accent', chip: 'bg-accent-soft text-accent' },
};

export const DELIVERY: Record<string, { label: string; tone: Tone }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'brand' },
  read: { label: 'Read', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'neutral' },
};

export const ROLE_LABEL: Record<string, string> = {
  management: 'Management',
  principal: 'Principal',
  admin: 'Office admin',
  accountant: 'Accountant',
  teacher: 'Teacher',
  class_teacher: 'Class teacher',
  parent: 'Parent',
  student: 'Student',
};

export const EVENT_LABEL: Record<string, string> = {
  'attendance.absent': 'Absence alert',
  'calendar.published': 'Holiday / event',
  'homework.posted': 'Homework digest',
  'material.added': 'New material',
  'circular.published': 'Circular',
};
