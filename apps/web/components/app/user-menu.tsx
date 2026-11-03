'use client';

import { ArrowLeftRight, Check, ChevronDown, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/card';
import { DropdownMenu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/overlay';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/cn';
import { setSession, updateSession } from '@/lib/session';
import { setTheme, type Theme, useTheme } from '@/lib/theme';
import { useApp } from './context';

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Match device', icon: Monitor },
];

/** Appearance choices, shared by every account menu. */
export function ThemeItems() {
  const theme = useTheme();
  return (
    <>
      <MenuLabel>Appearance</MenuLabel>
      {THEMES.map((t) => (
        <MenuItem key={t.value} onSelect={() => setTheme(t.value)}>
          <t.icon className="size-4" /> {t.label}
          {theme === t.value && <Check className="ml-auto size-4 text-brand" />}
        </MenuItem>
      ))}
    </>
  );
}

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
      <ThemeItems />
      <MenuSeparator />
      <MenuItem onSelect={signOut} danger>
        <LogOut className="size-4" /> Sign out
      </MenuItem>
    </DropdownMenu>
  );
}
