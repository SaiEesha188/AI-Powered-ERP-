'use client';

import { Briefcase, ChevronRight, GraduationCap, LogOut, School, ServerCog, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FullPageSpinner, Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Card, EmptyState } from '@/components/ui/card';
import { api } from '@/lib/api';
import { EXPERIENCE_LABEL, experiencesFor } from '@/lib/experience';
import { setSession, updateSession, useSession, type Experience } from '@/lib/session';
import { useQuery } from '@tanstack/react-query';
import type { Me } from '@/lib/types';

const ICONS: Record<Experience, typeof Briefcase> = { admin: Briefcase, teacher: GraduationCap, parent: Users, platform: ServerCog };

/** Picks the institute and app. Skipped automatically when there is only one choice. */
export default function SelectPage() {
  const router = useRouter();
  const session = useSession();
  const me = useQuery({ queryKey: ['me-root'], queryFn: () => api<Me>('/me', { noInstitute: true }), enabled: Boolean(session) });

  const choices = (me.data?.memberships ?? []).flatMap((m) => experiencesFor(m).map((experience) => ({ instituteId: m.instituteId as string | undefined, experience })));
  if (me.data?.user.isPlatformAdmin) choices.push({ instituteId: undefined, experience: 'platform' });

  function open(instituteId: string | undefined, experience: Experience) {
    updateSession({ instituteId, experience });
    router.replace(`/${experience}`);
  }

  useEffect(() => {
    if (session === null) router.replace('/login');
  }, [session, router]);

  useEffect(() => {
    if (choices.length === 1) open(choices[0]!.instituteId, choices[0]!.experience);
  }, [choices.length]);

  if (!session || me.isLoading || choices.length === 1) return <FullPageSpinner />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-6 py-10">
      <div className="flex items-center justify-between">
        <Logo />
        <Button variant="ghost" size="sm" onClick={() => (setSession(null), router.replace('/login'))}>
          <LogOut className="size-4" /> Sign out
        </Button>
      </div>
      <div className="mt-12 animate-in">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome{me.data ? `, ${me.data.user.name.split(' ')[0]}` : ''}</h1>
        <p className="mt-1 text-sm text-text-3">Choose where you want to go.</p>
      </div>
      {choices.length === 0 ? (
        <Card className="mt-8">
          <EmptyState icon={School} title="No school has added you yet" description="Ask your school office to add your mobile number, then sign in again." />
        </Card>
      ) : (
        <div className="mt-8 space-y-6">
          {(me.data?.memberships ?? []).map((m) => (
            <section key={m.instituteId}>
              <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-text-3">
                <School className="size-3.5" /> {m.name}
              </p>
              <Card className="divide-y divide-border overflow-hidden">
                {experiencesFor(m).map((exp) => (
                  <Choice key={exp} experience={exp} onClick={() => open(m.instituteId, exp)} />
                ))}
              </Card>
            </section>
          ))}
          {me.data?.user.isPlatformAdmin && (
            <section>
              <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-text-3">
                <ServerCog className="size-3.5" /> Our team
              </p>
              <Card className="overflow-hidden">
                <Choice experience="platform" onClick={() => open(undefined, 'platform')} />
              </Card>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function Choice({ experience, onClick }: { experience: Experience; onClick: () => void }) {
  const Icon = ICONS[experience];
  return (
    <button onClick={onClick} className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2">
      <span className="inline-flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-text">{EXPERIENCE_LABEL[experience].title}</span>
        <span className="block text-[13px] text-text-3">{EXPERIENCE_LABEL[experience].description}</span>
      </span>
      <ChevronRight className="size-5 text-text-3" />
    </button>
  );
}
