'use client';

import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { LiveConnectionState } from '@/lib/live-patch';

const CONFIG: Record<LiveConnectionState, { label: string; cls: string; dot: string }> = {
  CONNECTING: {
    label: 'Connecting…',
    cls: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400',
    dot: 'bg-amber-500 animate-pulse',
  },
  CONNECTED: {
    label: 'Live',
    cls: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
    dot: 'bg-emerald-500 animate-pulse',
  },
  RECONNECTING: {
    label: 'Reconnecting…',
    cls: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400',
    dot: 'bg-amber-500 animate-pulse',
  },
  DISCONNECTED: {
    label: 'Live updates unavailable',
    cls: 'bg-slate-500/10 text-slate-600 border-slate-500/30 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
  ERROR: {
    label: 'Live updates unavailable',
    cls: 'bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400',
    dot: 'bg-rose-500',
  },
};

/**
 * Real-time stream indicator for the train page. "Last updated" always reflects
 * the REAL observedAt from the latest backend snapshot (never render time); a
 * 10s re-render timer keeps the label honest while connected.
 */
export function LiveConnectionIndicator({
  state,
  lastObservedAt,
}: {
  state: LiveConnectionState;
  lastObservedAt?: string | null;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (state !== 'CONNECTED') return;
    const id = setInterval(() => setTick((t) => t + 1), 10 * 1000);
    return () => clearInterval(id);
  }, [state]);

  const cfg = CONFIG[state] || CONFIG.DISCONNECTED;
  const seconds =
    state === 'CONNECTED' && lastObservedAt
      ? Math.max(0, Math.round((Date.now() - Date.parse(lastObservedAt)) / 1000))
      : null;

  return (
    <span
      title="Real-time updates from the live tracking feed"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold',
        cfg.cls
      )}
    >
      <Radio className="h-3 w-3" />
      <span>{cfg.label}</span>
      {seconds !== null && (
        <span className="font-semibold opacity-80">· {seconds}s ago</span>
      )}
    </span>
  );
}
