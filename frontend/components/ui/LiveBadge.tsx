import React from 'react';
import { cn } from '@/utils/cn';

export type LiveState = 'live' | 'stale' | 'unavailable';

const CONFIG: Record<LiveState, { label: string; color: string; dot: string }> = {
  live: {
    label: 'LIVE',
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-500 text-emerald-500',
  },
  stale: {
    label: 'STALE',
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    dot: 'bg-amber-500 text-amber-500',
  },
  unavailable: {
    label: 'UNAVAILABLE',
    color: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/30',
    dot: 'bg-slate-400 text-slate-400',
  },
};

interface LiveBadgeProps {
  state: LiveState;
  className?: string;
}

/**
 * Freshness indicator. LIVE only ever shows when backend data is fresh;
 * stale / unavailable are shown otherwise. Uses a label + icon, not color alone.
 */
export function LiveBadge({ state, className }: LiveBadgeProps) {
  const cfg = CONFIG[state];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-widest uppercase',
        cfg.color,
        className
      )}
    >
      {state === 'live' ? (
        <span className="live-dot" aria-hidden />
      ) : (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      )}
      {cfg.label}
    </span>
  );
}

/** Derive a LiveState from an ISO lastUpdated timestamp + freshness window. */
export function liveStateFromTimestamp(iso?: string, staleAfterMs = 120_000): LiveState {
  if (!iso) return 'unavailable';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return 'unavailable';
  if (diff <= staleAfterMs) return 'live';
  return 'stale';
}
