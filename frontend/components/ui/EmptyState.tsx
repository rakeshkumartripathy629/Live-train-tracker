import React from 'react';
import { TrainFront } from 'lucide-react';
import { cn } from '@/utils/cn';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
  iconClass?: string;
}

export function EmptyState({
  title,
  description,
  action,
  className,
  icon,
  iconClass,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'card-surface flex flex-col items-center justify-center rounded-3xl p-10 sm:p-12 text-center space-y-4',
        className
      )}
    >
      <div
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800',
          iconClass
        )}
      >
        {icon || <TrainFront className="h-8 w-8" />}
      </div>
      {title && (
        <h3 className="rail-heading text-lg text-slate-900 dark:text-white">{title}</h3>
      )}
      {description && (
        <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">{description}</p>
      )}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
