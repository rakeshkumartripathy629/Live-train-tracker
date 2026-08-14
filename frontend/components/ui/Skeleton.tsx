import React from 'react';
import { cn } from '@/utils/cn';

interface SkeletonProps {
  className?: string;
  shimmer?: boolean;
}

export function Skeleton({ className, shimmer = true }: SkeletonProps) {
  return (
    <div
      className={cn('rounded-xl', shimmer ? 'skeleton-shimmer' : 'animate-pulse bg-slate-200/70 dark:bg-slate-800/70', className)}
      aria-hidden
    />
  );
}

/** Train card skeleton used during search / between-station loading. */
export function TrainCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('card-surface p-5 space-y-4', className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}

/** Journey / live summary skeleton. */
export function JourneySkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('card-surface p-5 space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-48" />
        </div>
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    </div>
  );
}
