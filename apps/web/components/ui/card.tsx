import type { LucideIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn, initials } from '@/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[var(--radius-card)] border border-border bg-surface shadow-card', className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-text">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-text-3">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

const tones = {
  neutral: 'bg-surface-2 text-text-2',
  brand: 'bg-brand-soft text-brand',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = 'neutral', className, children, dot }: { tone?: Tone; className?: string; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium', tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const avatarColors = ['bg-brand-soft text-brand', 'bg-accent-soft text-accent', 'bg-info-soft text-info', 'bg-warning-soft text-warning', 'bg-success-soft text-success'];

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const color = avatarColors[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % avatarColors.length];
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', color, className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
}) {
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-text-3 sm:text-[13px]">{label}</p>
        {Icon && (
          <span className={cn('hidden size-9 shrink-0 items-center justify-center rounded-xl sm:inline-flex', tones[tone])}>
            <Icon className="size-[18px]" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-2 text-[24px] font-semibold leading-none tracking-tight text-text tabular-nums sm:text-[28px]">{value}</p>
      {hint && <div className="mt-2 text-[12.5px] text-text-3">{hint}</div>}
    </Card>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-text-3">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="mt-4 text-[15px] font-semibold text-text">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-text-3">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-2', className)} aria-hidden />;
}

export function Progress({ value, tone = 'brand', className }: { value: number; tone?: 'brand' | 'accent' | 'success' | 'danger' | 'warning'; className?: string }) {
  const bar = { brand: 'bg-brand', accent: 'bg-accent', success: 'bg-success', danger: 'bg-danger', warning: 'bg-warning' }[tone];
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', bar)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
