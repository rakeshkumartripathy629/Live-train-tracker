import React from 'react';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-rail-blue text-white shadow-glow hover:bg-sky-600 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
  secondary:
    'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50',
  ghost:
    'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50',
  danger:
    'bg-rose-500 text-white shadow-sm hover:bg-rose-600 active:scale-[0.98] disabled:opacity-50',
  success:
    'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-xs gap-1.5 rounded-xl',
  md: 'h-11 px-5 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-sm gap-2 rounded-2xl',
  icon: 'h-11 w-11 rounded-xl',
};

/** Consistent button system — min 44px touch targets on md+ sizes. */
export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-bold transition-all',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    />
  );
}
