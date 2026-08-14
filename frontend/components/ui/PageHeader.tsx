import React from 'react';
import { cn } from '@/utils/cn';

interface PageHeaderProps {
  icon: React.ReactNode;
  iconClass?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/** Consistent premium page header used across every screen. */
export function PageHeader({
  icon,
  iconClass,
  title,
  subtitle,
  description,
  action,
  className,
}: PageHeaderProps) {
  const desc = description ?? subtitle;
  return (
    <div className={cn('flex items-center justify-between gap-3 flex-wrap', className)}>
      <div className="flex items-center gap-3.5 min-w-0">
        <div
          className={cn(
            'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl shadow-soft ring-1 ring-black/5 dark:ring-white/10',
            iconClass || 'bg-rail-blue/10 text-rail-blue'
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h1 className="rail-heading text-xl sm:text-2xl text-slate-900 dark:text-white truncate">
            {title}
          </h1>
          {desc && (
            <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {desc}
            </p>
          )}
        </div>
      </div>
      {action && <div className="flex flex-shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

interface SectionHeaderProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ icon, title, count, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 truncate">
          {title}
        </h2>
        {typeof count === 'number' && (
          <span className="rounded-full bg-rail-blue/10 px-2 py-0.5 font-mono text-[11px] font-bold text-rail-blue">
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}
