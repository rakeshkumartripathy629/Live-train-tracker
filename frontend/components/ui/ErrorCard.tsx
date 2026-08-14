'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/utils/cn';

interface ErrorCardProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorCard({ title = 'Something went wrong', message, onRetry, className }: ErrorCardProps) {
  return (
    <EmptyState
      className={cn('border-rose-500/20', className)}
      icon={<AlertTriangle className="h-8 w-8" />}
      iconClass="bg-rose-500/10 text-rose-500"
      title={title}
      description={
        message ||
        'We could not load the latest information right now. Please try again.'
      }
      action={
        onRetry ? (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-5 py-2.5 text-xs font-bold text-white shadow-glow transition-all hover:bg-sky-600 active:scale-[0.98]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try Again
          </button>
        ) : undefined
      }
    />
  );
}
