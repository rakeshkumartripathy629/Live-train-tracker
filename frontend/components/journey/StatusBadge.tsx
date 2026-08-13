import React from 'react';
import { cn } from '@/utils/cn';

export type TrainLiveStatus =
  | 'running'
  | 'delayed'
  | 'on_time'
  | 'not_started'
  | 'completed'
  | 'cancelled'
  | 'unavailable';

const STATUS_CONFIG: Record<TrainLiveStatus, { label: string; color: string; dot: string }> = {
  running: {
    label: 'Running',
    color: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
    dot: 'bg-emerald-500 animate-pulse',
  },
  delayed: {
    label: 'Delayed',
    color: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400',
    dot: 'bg-amber-500 animate-pulse',
  },
  on_time: {
    label: 'On Time',
    color: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  not_started: {
    label: 'Not Started',
    color: 'bg-slate-500/15 text-slate-600 border-slate-500/30 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
  completed: {
    label: 'Journey Complete',
    color: 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-400',
    dot: 'bg-sky-500',
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-400',
    dot: 'bg-rose-500',
  },
  unavailable: {
    label: 'Unavailable',
    color: 'bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400',
    dot: 'bg-amber-500/50',
  },
};

interface StatusBadgeProps {
  status: TrainLiveStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unavailable;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold',
        cfg.color,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}
