'use client';

import { ArrowLeftRight, ChevronDown, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/card';
import { DropdownMenu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/cn';
import { setSession, updateSession } from '@/lib/session';
import { useApp } from './context';

export function UserMenu({ compact }: { compact?: boolean }) {
  const { me } = useApp();
  const router = useRouter();
  const client = useQueryClient();

  async function signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSession(null);
    client.clear();
    router.replace('/login');
  }

  return (
    <DropdownMenu
      trigger={
        <button className="flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors hover:bg-surface-2" aria-label="Account menu">
          <Avatar name={me.user.name} size={32} />
          {!compact && (
            <>
              <span className="hidden text-left sm:block">
                <span className="block text-[13px] font-semibold leading-tight text-text">{me.user.name}</span>
                <span className="block text-[11.5px] leading-tight text-text-3">{formatPhone(me.user.phone)}</span>
              </span>
              <ChevronDown className="hidden size-4 text-text-3 sm:block" />
            </>
          )}
        </button>
      }
    >
      <MenuLabel>{me.user.name}</MenuLabel>
      <MenuItem
        onSelect={() => {
          updateSession({ experience: undefined, instituteId: undefined });
          client.clear();
          router.push('/select');
        }}
      >
        <ArrowLeftRight className="size-4" /> Switch institute or app
      </MenuItem>
      <MenuSeparator />
      <MenuItem onSelect={signOut} danger>
        <LogOut className="size-4" /> Sign out
      </MenuItem>
    </DropdownMenu>
  );
}
