'use client';

import { ArrowLeftRight, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ThemeItems } from '@/components/app/user-menu';
import { FullPageSpinner, Logo } from '@/components/brand';
import { Avatar, Badge } from '@/components/ui/card';
import { DropdownMenu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { useApi } from '@/lib/query';
import { setSession, updateSession, useSession } from '@/lib/session';
import type { Me } from '@/lib/types';

/** Our own team's console (M01). Needs a platform admin account, not an institute. */
export default function PlatformLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const client = useQueryClient();
  const session = useSession();
  const me = useApi<Me>('/me', { noInstitute: true });

  useEffect(() => {
    if (session === null) router.replace('/login');
    else if (me.data && !me.data.user.isPlatformAdmin) router.replace('/select');
  }, [session, me.data, router]);

  if (!session || !me.data?.user.isPlatformAdmin) return <FullPageSpinner />;

  async function signOut() {
    await api('/auth/logout', { method: 'POST', noInstitute: true }).catch(() => undefined);
    setSession(null);
    client.clear();
    router.replace('/login');
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
          <Logo />
          <Badge tone="brand" className="ml-1">
            Platform console
          </Badge>
          <div className="ml-auto">
            <DropdownMenu
              trigger={
                <button className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-surface-2" aria-label="Account menu">
                  <Avatar name={me.data.user.name} size={32} />
                  <span className="hidden text-[13px] font-semibold sm:block">{me.data.user.name}</span>
                </button>
              }
            >
              <MenuLabel>{me.data.user.name}</MenuLabel>
              <MenuItem
                onSelect={() => {
                  updateSession({ experience: undefined, instituteId: undefined });
                  client.clear();
                  router.push('/select');
                }}
              >
                <ArrowLeftRight className="size-4" /> Switch app
              </MenuItem>
              <MenuSeparator />
              <ThemeItems />
              <MenuSeparator />
              <MenuItem onSelect={signOut} danger>
                <LogOut className="size-4" /> Sign out
              </MenuItem>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8 animate-in">{children}</main>
    </div>
  );
}
