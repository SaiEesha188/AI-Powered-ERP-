'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowRight, GraduationCap, Layers, type LucideIcon, Search, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { useApi } from '@/lib/query';
import type { SectionRow, StaffRow, StudentRow } from '@/lib/types';
import { useApp } from './context';

export interface CommandPage {
  href: string;
  label: string;
  icon: LucideIcon;
  needs: string[];
}

interface Result {
  key: string;
  group: string;
  label: string;
  hint?: string;
  href: string;
  icon?: LucideIcon;
  avatar?: string;
}

/** Ctrl+K quick search across students, staff, sections and pages. */
export function CommandPalette({ pages }: { pages: CommandPage[] }) {
  const { can, term } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const query = useDeferredValue(q.trim());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const students = useApi<StudentRow[]>(query.length >= 2 && can('students.view') ? `/students?q=${encodeURIComponent(query)}&limit=8` : null);
  const staff = useApi<StaffRow[]>(open && can('staff.view') ? '/staff' : null);
  const sections = useApi<SectionRow[]>(open && can('academics.view') ? '/sections' : null);

  const results = useMemo<Result[]>(() => {
    const lower = query.toLowerCase();
    const match = (text: string) => !lower || text.toLowerCase().includes(lower);
    const out: Result[] = [];
    for (const s of students.data ?? []) {
      out.push({ key: `s${s.id}`, group: `${term.student}s`, label: s.name, hint: s.className ? `${s.className} · ${s.sectionName} · Adm. ${s.admissionNo}` : `Adm. ${s.admissionNo}`, href: `/admin/students/${s.id}`, avatar: s.name });
    }
    for (const s of (staff.data ?? []).filter((x) => match(x.name) || match(x.designation)).slice(0, 5)) {
      out.push({ key: `t${s.id}`, group: 'Staff', label: s.name, hint: s.designation, href: '/admin/staff', avatar: s.name });
    }
    for (const s of (sections.data ?? []).filter((x) => match(`${x.className} ${x.name}`)).slice(0, 5)) {
      out.push({ key: `c${s.id}`, group: `${term.section}s`, label: `${s.className} · ${s.name}`, hint: s.classTeacher ? `Class teacher ${s.classTeacher.name}` : undefined, href: `/admin/attendance/${s.id}`, icon: Layers });
    }
    for (const p of pages.filter((x) => can(...x.needs) && match(x.label))) {
      out.push({ key: `p${p.href}`, group: 'Pages', label: p.label, href: p.href, icon: p.icon });
    }
    return out;
  }, [query, students.data, staff.data, sections.data, pages, can, term]);

  useEffect(() => setActive(0), [results.length, query]);

  function go(r: Result) {
    setOpen(false);
    setQ('');
    router.push(r.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, results.length - 1)));
    if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
    if (e.key === 'Enter' && results[active]) (e.preventDefault(), go(results[active]));
  }

  const groups = [...new Set(results.map((r) => r.group))];
  let index = -1;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden h-9 items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-[13px] text-text-3 shadow-soft hover:bg-surface-2 sm:inline-flex"
        aria-label="Search"
      >
        <Search className="size-4" /> Search
        <kbd className="ml-6 rounded-md border border-border bg-surface-2 px-1.5 font-sans text-[11px] text-text-3">Ctrl K</kbd>
      </button>
      <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-text-2 hover:bg-surface-2 sm:hidden" aria-label="Search">
        <Search className="size-5" />
      </button>
      <DialogPrimitive.Root open={open} onOpenChange={(o) => (setOpen(o), !o && setQ(''))}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgb(8_15_28/0.45)] backdrop-blur-[2px] animate-in" />
          <DialogPrimitive.Content
            className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-pop animate-in focus:outline-none"
            onOpenAutoFocus={(e) => (e.preventDefault(), inputRef.current?.focus())}
          >
            <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-5 text-text-3" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`Search ${term.student.toLowerCase()}s, staff, ${term.section.toLowerCase()}s, pages…`}
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-text-3"
                aria-label="Search"
                autoComplete="off"
              />
              <kbd className="rounded-md border border-border bg-surface-2 px-1.5 font-sans text-[11px] text-text-3">Esc</kbd>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
              {results.length === 0 && <p className="px-3 py-8 text-center text-sm text-text-3">{query.length < 2 ? 'Type a name, section or page' : 'No matches'}</p>}
              {groups.map((g) => (
                <div key={g}>
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-3">{g}</p>
                  {results
                    .filter((r) => r.group === g)
                    .map((r) => {
                      index += 1;
                      const i = index;
                      return (
                        <button
                          key={r.key}
                          role="option"
                          aria-selected={i === active}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => go(r)}
                          className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left', i === active ? 'bg-brand-soft text-brand' : 'text-text')}
                        >
                          {r.avatar ? (
                            <Avatar name={r.avatar} size={28} />
                          ) : (
                            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-surface-2 text-text-2">{r.icon ? <r.icon className="size-4" /> : null}</span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{r.label}</span>
                            {r.hint && <span className="block truncate text-[12px] text-text-3">{r.hint}</span>}
                          </span>
                          {i === active && <ArrowRight className="size-4" />}
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

export const COMMAND_ICONS = { GraduationCap, Users };
