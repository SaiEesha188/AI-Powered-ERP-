import type { Experience } from './session';
import type { Membership } from './types';

const TEACHING = new Set(['teacher', 'class_teacher']);
const FAMILY = new Set(['parent', 'student']);

/** Which apps a membership opens: office roles get the portal, teachers the teacher app, parents the parent app. */
export function experiencesFor(m: Membership): Experience[] {
  const codes = m.roles.map((r) => r.code);
  const out: Experience[] = [];
  // Any role that is neither teaching nor family (admin, principal, custom office roles) uses the portal.
  if (codes.some((c) => !TEACHING.has(c) && !FAMILY.has(c))) out.push('admin');
  if (codes.some((c) => TEACHING.has(c))) out.push('teacher');
  if (codes.includes('parent')) out.push('parent');
  return out;
}

export const EXPERIENCE_LABEL: Record<Experience, { title: string; description: string }> = {
  admin: { title: 'School office', description: 'Dashboards, students, staff, calendar and circulars' },
  teacher: { title: 'Teacher', description: 'Attendance, homework and your classes' },
  parent: { title: 'Parent', description: 'Your children’s attendance, homework and notices' },
  platform: { title: 'Platform console', description: 'Institutes, plans, usage and onboarding' },
};
