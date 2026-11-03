'use client';

import { Bell, BookOpen, ClipboardCheck, CloudOff, Home, Library, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { AppProvider, useApp } from '@/components/app/context';
import { useUnread } from '@/components/app/inbox';
import { MobileShell } from '@/components/app/mobile-shell';
import { UserMenu } from '@/components/app/user-menu';
import { useAutoSync, useOnline, usePendingAttendance } from '@/lib/offline';
import { useSession } from '@/lib/session';

function Header() {
  const { me } = useApp();
  const online = useOnline();
  const pending = usePendingAttendance();
  const session = useSession();
  const membership = me.memberships.find((m) => m.instituteId === session?.instituteId);
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-text-3">{membership?.name}</p>
          <p className="truncate text-[17px] font-semibold tracking-tight">Hi, {me.user.name.split(' ')[0]}</p>
        </div>
        <UserMenu compact />
      </div>
      {(!online || pending.length > 0) && (
        <div className={`mt-2.5 flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-medium ${online ? 'bg-info-soft text-info' : 'bg-warning-soft text-warning'}`} role="status">
          {online ? <RefreshCw className="size-4 animate-spin" /> : <CloudOff className="size-4" />}
          {online ? `Syncing ${pending.length} saved register${pending.length > 1 ? 's' : ''}…` : pending.length ? `Offline · ${pending.length} register${pending.length > 1 ? 's' : ''} saved on this phone` : 'Offline · you can still take attendance'}
        </div>
      )}
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const unread = useUnread();
  useAutoSync((r) => {
    if (r.sent) toast.success(`${r.sent} saved register${r.sent > 1 ? 's' : ''} sent`);
    r.rejected.forEach((m) => toast.error(m));
  });
  return (
    <MobileShell
      root="/teacher"
      header={<Header />}
      tabs={[
        { href: '/teacher', label: 'Today', icon: Home },
        { href: '/teacher/attendance', label: 'Attendance', icon: ClipboardCheck },
        { href: '/teacher/homework', label: 'Homework', icon: BookOpen },
        { href: '/teacher/materials', label: 'Material', icon: Library },
        { href: '/teacher/inbox', label: 'Inbox', icon: Bell, badge: unread },
      ]}
    >
      {children}
    </MobileShell>
  );
}

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <AppProvider experience="teacher">
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
