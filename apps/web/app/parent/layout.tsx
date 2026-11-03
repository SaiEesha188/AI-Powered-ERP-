'use client';

import { Bell, BookOpen, CalendarCheck2, GraduationCap, Home, Library } from 'lucide-react';
import type { ReactNode } from 'react';
import { ChildProvider, ChildSwitcher, useChild } from '@/components/app/child';
import { AppProvider } from '@/components/app/context';
import { useUnread } from '@/components/app/inbox';
import { MobileShell } from '@/components/app/mobile-shell';
import { UserMenu } from '@/components/app/user-menu';

function Header() {
  const { child } = useChild();
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-text-3">{child.className ? `${child.className} · ${child.sectionName}` : 'Not enrolled yet'}</p>
          <p className="truncate text-[17px] font-semibold tracking-tight">{child.name}</p>
        </div>
        <UserMenu compact />
      </div>
      <ChildSwitcher />
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const unread = useUnread();
  return (
    <MobileShell
      root="/parent"
      header={<Header />}
      tabs={[
        { href: '/parent', label: 'Home', icon: Home },
        { href: '/parent/attendance', label: 'Attendance', icon: CalendarCheck2 },
        { href: '/parent/homework', label: 'Homework', icon: BookOpen },
        { href: '/parent/results', label: 'Results', icon: GraduationCap },
        { href: '/parent/notices', label: 'Notices', icon: Bell, badge: unread },
        { href: '/parent/learn', label: 'Learn', icon: Library },
      ]}
    >
      {children}
    </MobileShell>
  );
}

export default function ParentLayout({ children }: { children: ReactNode }) {
  return (
    <AppProvider experience="parent">
      <div className="min-h-dvh">
        <ChildProvider>
          <Shell>{children}</Shell>
        </ChildProvider>
      </div>
    </AppProvider>
  );
}
