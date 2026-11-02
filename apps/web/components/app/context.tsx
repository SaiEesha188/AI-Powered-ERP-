'use client';

import { useRouter } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect } from 'react';
import { FullPageSpinner } from '@/components/brand';
import { experiencesFor } from '@/lib/experience';
import { useApi } from '@/lib/query';
import { type Experience, useSession } from '@/lib/session';
import type { Institute, Me } from '@/lib/types';

interface AppContextValue {
  me: Me;
  institute: Institute;
  permissions: Set<string>;
  can: (...codes: string[]) => boolean;
  /** The institute's own words: Class/Batch, Homework/Assignment... (CFG-02). */
  term: Institute['settings']['terminology'];
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside AppProvider');
  return ctx;
}

/** Loads the signed-in person and their institute; redirects when the session does not fit this app. */
export function AppProvider({ experience, children }: { experience: Experience; children: ReactNode }) {
  const router = useRouter();
  const session = useSession();
  const me = useApi<Me>('/me');
  const institute = useApi<Institute>(experience === 'admin' ? '/institute' : null);

  const membership = me.data?.memberships.find((m) => m.instituteId === session?.instituteId);
  const allowed = membership ? experiencesFor(membership).includes(experience) : false;

  useEffect(() => {
    if (session === null) router.replace('/login');
    else if (session && !session.instituteId) router.replace('/select');
    else if (me.data && !allowed) router.replace('/select');
  }, [session, me.data, allowed, router]);

  if (!session || !me.data || !membership || !allowed) return <FullPageSpinner />;
  // Roles without institute.settings.view (e.g. accountant) fall back to the membership's basics.
  if (experience === 'admin' && institute.isLoading) return <FullPageSpinner />;

  const permissions = new Set(me.data.permissions ?? []);
  const fallback: Institute = {
    id: membership.instituteId,
    name: membership.name,
    vertical: membership.vertical,
    board: null,
    subdomain: membership.subdomain,
    timezone: 'Asia/Kolkata',
    settings: {
      terminology: { class: 'Class', section: 'Section', homework: 'Homework', student: 'Student', teacher: 'Teacher', exam: 'Exam' },
      branding: {},
      familyChannel: 'whatsapp',
      workingDays: [1, 2, 3, 4, 5, 6],
      holidayApprovalRequired: false,
      homeworkDigestTime: '16:00',
      attendanceCutoffTime: '10:00',
      circularApprovalRequired: false,
    },
  };
  const inst = institute.data ?? fallback;
  const value: AppContextValue = {
    me: me.data,
    institute: inst,
    permissions,
    can: (...codes) => codes.every((c) => permissions.has(c)),
    term: inst.settings.terminology,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
