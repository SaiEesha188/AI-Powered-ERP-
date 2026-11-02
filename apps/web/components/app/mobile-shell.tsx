'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface MobileTab {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

/**
 * Phone layout for the teacher and parent apps: content plus a bottom tab bar with large
 * touch targets. On wider screens it stays a centred phone-width column.
 */
export function MobileShell({ header, tabs, children, root }: { header: ReactNode; tabs: MobileTab[]; children: ReactNode; root: string }) {
  const path = usePathname();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg sm:my-6 sm:min-h-[calc(100dvh-3rem)] sm:overflow-hidden sm:rounded-[28px] sm:border sm:border-border sm:shadow-pop">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur-md">{header}</header>
      <main className="flex-1 px-4 pb-28 pt-4 animate-in">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-border bg-surface/95 backdrop-blur-md safe-bottom sm:absolute sm:rounded-b-[28px]" aria-label="Main">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((t) => {
            const active = t.href === root ? path === root : path.startsWith(t.href);
            return (
              <li key={t.href}>
                <Link href={t.href} className={cn('relative flex flex-col items-center gap-1 pb-1 pt-2.5 text-[11px] font-medium', active ? 'text-brand' : 'text-text-3')} aria-current={active ? 'page' : undefined}>
                  <span className={cn('relative inline-flex h-8 w-14 items-center justify-center rounded-full transition-colors', active && 'bg-brand-soft')}>
                    <t.icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.9} aria-hidden />
                    {t.badge ? (
                      <span className="absolute right-2 top-0 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white">{t.badge > 9 ? '9+' : t.badge}</span>
                    ) : null}
                  </span>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** Big tappable row for lists in the mobile apps. */
export function ListCard({ children, className, href }: { children: ReactNode; className?: string; href?: string }) {
  const cls = cn('block rounded-2xl border border-border bg-surface p-4 shadow-soft transition-colors', href && 'active:bg-surface-2', className);
  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}
