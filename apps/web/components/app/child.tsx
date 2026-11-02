'use client';

import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { LogOut, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, EmptyState, Skeleton } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { useApi } from '@/lib/query';
import { setSession } from '@/lib/session';
import type { Child } from '@/lib/types';

const KEY = 'erp.parent.child';
const ChildContext = createContext<{ child: Child; children: Child[]; select: (id: string) => void } | null>(null);

export function useChild() {
  const ctx = useContext(ChildContext);
  if (!ctx) throw new Error('useChild outside ChildProvider');
  return ctx;
}

/** USR-05: all siblings under one login; the chosen child is remembered on this phone. */
export function ChildProvider({ children: content }: { children: ReactNode }) {
  const list = useApi<Child[]>('/family/children');
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSelected(localStorage.getItem(KEY));
    } catch {
      // storage blocked: default to the first child
    }
  }, []);

  if (list.isLoading) return <Skeleton className="m-4 h-40 rounded-2xl" />;
  const kids = list.data ?? [];
  if (!kids.length) {
    return (
      <EmptyState
        className="min-h-dvh justify-center"
        icon={Users}
        title="No children linked yet"
        description="Ask the school office to link your number to your child’s record."
        action={
          <Button variant="outline" onClick={() => (setSession(null), (window.location.href = '/login'))}>
            <LogOut className="size-4" /> Sign out
          </Button>
        }
      />
    );
  }

  const child = kids.find((c) => c.id === selected) ?? kids[0]!;
  const select = (id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // ignore
    }
  };
  return <ChildContext.Provider value={{ child, children: kids, select }}>{content}</ChildContext.Provider>;
}

export function ChildSwitcher() {
  const { child, children: kids, select } = useChild();
  if (kids.length < 2) return null;
  return (
    <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5" role="tablist" aria-label="Choose child">
      {kids.map((k) => {
        const on = k.id === child.id;
        return (
          <button
            key={k.id}
            role="tab"
            aria-selected={on}
            onClick={() => select(k.id)}
            className={cn('flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-[13.5px] font-medium transition-colors', on ? 'border-brand bg-brand text-on-brand' : 'border-border bg-surface text-text-2')}
          >
            <Avatar name={k.name} size={28} className={on ? 'ring-2 ring-white/40' : ''} />
            {k.name.split(' ')[0]}
          </button>
        );
      })}
    </div>
  );
}
