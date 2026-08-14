import React from 'react';
import { cn } from '@/utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  padded?: boolean;
}

/** Unified premium card surface. */
export function Card({ hover, padded = true, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'card-surface',
        padded && 'p-4 sm:p-5',
        hover && 'card-surface-hover hover:-translate-y-0.5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface StatProps {
  icon: React.ReactNode;
  iconClass?: string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
  mono?: boolean;
}

/** Compact metric tile used across dashboard/analytics/cards. */
export function Stat({ icon, iconClass, label, value, sub, className, mono = true }: StatProps) {
  return (
    <div className={cn('card-surface p-3.5 sm:p-4', className)}>
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl',
            iconClass || 'bg-rail-blue/10 text-rail-blue'
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {label}
          </p>
          <p className={cn('tnum truncate text-sm font-extrabold text-slate-900 dark:text-white', mono && 'font-mono')}>
            {value}
          </p>
          {sub && <p className="truncate text-[10px] text-slate-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
}
