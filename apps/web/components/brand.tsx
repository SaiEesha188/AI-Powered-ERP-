import { cn } from '@/lib/cn';

/** Product mark: an open book whose pages form a rising check, for learning that gets done. */
export function Logo({ className, withName = true }: { className?: string; withName?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className="inline-flex size-9 items-center justify-center rounded-xl bg-brand text-on-brand shadow-soft">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 6.5C5.5 5 8.5 5 12 7c3.5-2 6.5-2 9-.5V18c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5z" />
          <path d="m8.5 12.5 2.5 2.5 4.5-5" />
        </svg>
      </span>
      {withName && (
        <span className="text-[17px] font-semibold tracking-tight text-text">
          Vidya<span className="text-accent"> ERP</span>
        </span>
      )}
    </span>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
      <span className="size-8 animate-spin rounded-full border-[3px] border-border border-t-brand" />
    </div>
  );
}
