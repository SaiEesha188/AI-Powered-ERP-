'use client';

import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  Menu,
  MessageSquareText,
  Settings,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { AppProvider, useApp } from '@/components/app/context';
import { UserMenu } from '@/components/app/user-menu';
import { Logo } from '@/components/brand';
import { cn } from '@/lib/cn';

interface NavItem {
  href: string;
  label: (t: ReturnType<typeof useApp>['term']) => string;
  icon: typeof LayoutDashboard;
  needs: string[];
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Today',
    items: [
      { href: '/admin', label: () => 'Overview', icon: LayoutDashboard, needs: ['reports.view'] },
      { href: '/admin/attendance', label: () => 'Attendance', icon: ClipboardCheck, needs: ['attendance.view'] },
      { href: '/admin/homework', label: (t) => t.homework, icon: BookOpen, needs: ['homework.view'] },
    ],
  },
  {
    group: 'People',
    items: [
      { href: '/admin/students', label: (t) => `${t.student}s`, icon: GraduationCap, needs: ['students.view'] },
      { href: '/admin/staff', label: () => 'Staff', icon: Users, needs: ['staff.view'] },
    ],
  },
  {
    group: 'School',
    items: [
      { href: '/admin/classes', label: (t) => `${t.class}es & subjects`, icon: FileText, needs: ['academics.view'] },
      { href: '/admin/calendar', label: () => 'Calendar', icon: CalendarDays, needs: ['calendar.view'] },
      { href: '/admin/circulars', label: () => 'Circulars', icon: Megaphone, needs: ['comms.view'] },
      { href: '/admin/messages', label: () => 'Messages', icon: MessageSquareText, needs: ['comms.view'] },
      { href: '/admin/reports', label: () => 'Reports', icon: BarChart3, needs: ['reports.view'] },
      { href: '/admin/settings', label: () => 'Settings', icon: Settings, needs: ['institute.settings.view'] },
    ],
  },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can, term, institute } = useApp();
  const path = usePathname();
  return (
    <nav className="flex h-full flex-col" aria-label="Main">
      <div className="px-5 pb-4 pt-5">
        <Logo />
      </div>
      <div className="mx-3 mb-3 rounded-xl border border-border bg-surface-2/60 px-3 py-2.5">
        <p className="truncate text-[13px] font-semibold text-text">{institute.name}</p>
        <p className="text-[11.5px] capitalize text-text-3">
          {institute.vertical}
          {institute.board ? ` · ${institute.board}` : ''}
        </p>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(...i.needs));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">{g.group}</p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = item.href === '/admin' ? path === '/admin' : path.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          'flex items-center gap-3 rounded-[10px] px-3 py-2 text-[14px] font-medium transition-colors',
                          active ? 'bg-brand text-on-brand shadow-soft' : 'text-text-2 hover:bg-surface-2 hover:text-text',
                        )}
                        aria-current={active ? 'page' : undefined}
                      >
                        <item.icon className="size-[18px]" aria-hidden />
                        {item.label(term)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-border bg-surface lg:block">
        <Sidebar />
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-[rgb(8_15_28/0.45)]" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-pop animate-in">
            <button className="absolute right-3 top-5 rounded-lg p-1.5 text-text-3 hover:bg-surface-2" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur-md sm:px-6">
          <button className="rounded-lg p-2 text-text-2 hover:bg-surface-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="lg:hidden">
            <Logo withName={false} />
          </div>
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8 animate-in">{children}</main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppProvider experience="admin">
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
