'use client';

import { Search } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';
import { Input, Select } from '@/components/ui/form';
import { cn } from '@/lib/cn';
import { useApi } from '@/lib/query';
import type { SectionRow } from '@/lib/types';

/** Sections of the current academic year, ordered by class. */
export function useSections() {
  return useApi<SectionRow[]>('/sections');
}

export function sectionLabel(s: { className: string; name?: string; sectionName?: string }) {
  return `${s.className} · ${s.name ?? s.sectionName}`;
}

export function SectionSelect({
  value,
  onChange,
  allLabel,
  id,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  allLabel?: string;
  id?: string;
  className?: string;
}) {
  const sections = useSections();
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className} disabled={sections.isLoading}>
      {allLabel !== undefined ? <option value="">{allLabel}</option> : <option value="" disabled>Choose…</option>}
      {(sections.data ?? []).map((s) => (
        <option key={s.id} value={s.id}>
          {sectionLabel(s)}
        </option>
      ))}
    </Select>
  );
}

export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" aria-hidden />
      <Input type="search" className="pl-9" {...props} />
    </div>
  );
}
