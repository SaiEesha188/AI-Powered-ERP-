import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium transition-[background,box-shadow,color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 select-none',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-on-brand shadow-soft hover:bg-brand-2',
        accent: 'bg-accent text-white shadow-soft hover:brightness-110',
        secondary: 'bg-surface-2 text-text hover:bg-border',
        outline: 'border border-border bg-surface text-text shadow-soft hover:bg-surface-2',
        ghost: 'text-text-2 hover:bg-surface-2 hover:text-text',
        danger: 'bg-danger text-white shadow-soft hover:brightness-110',
        link: 'text-brand underline-offset-4 hover:underline px-0',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-5 text-[15px]',
        xl: 'h-14 px-6 text-base rounded-xl',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, ...props }, ref) => (
  <button ref={ref} className={cn(buttonStyles({ variant, size }), className)} disabled={disabled || loading} {...props}>
    {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
    {children}
  </button>
));
Button.displayName = 'Button';
