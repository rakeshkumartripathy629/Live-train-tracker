'use client';

import React from 'react';
import Link from 'next/link';
import { Train } from 'lucide-react';
import { LiveBoardTrain } from '@/types/station';
import { cn } from '@/utils/cn';

export function statusStyle(type: string) {
  switch (type) {
    case 'at-station':
      return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400';
    case 'departed':
      return 'bg-slate-500/15 text-slate-600 border-slate-500/30 dark:text-slate-300';
    case 'upcoming':
      return 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-400';
    default:
      return 'bg-slate-400/15 text-slate-500 border-slate-400/30 dark:text-slate-400';
  }
}

export function LiveBoardRow({ item }: { item: LiveBoardTrain }) {
  const { train, stop, live } = item;
  return (
    <Link
      href={`/train/${train.number}`}
      className="group flex items-center justify-between gap-4 rounded-2xl px-4 py-3.5 transition-all hover:bg-rail-blue/5"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-rail-blue/10 text-rail-blue group-hover:bg-rail-blue group-hover:text-white transition-colors">
          <Train className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] font-bold text-rail-blue">{train.number}</span>
            <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{train.name}</span>
          </div>
          <span className="text-[11px] text-slate-400">
            {train.source} → {train.destination}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="text-right">
          <p className="font-mono text-sm font-extrabold text-slate-900 dark:text-white">
            {stop.departure || stop.arrival || '—'}
          </p>
          <p className="text-[10px] text-slate-400">Sch. Time</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold capitalize',
            statusStyle(live.type)
          )}
        >
          {live.type.replace('-', ' ')}
        </span>
        <div className="text-right w-16">
          {live.platform || stop.platform ? (
            <>
              <p className="font-mono text-sm font-extrabold text-rail-blue">{live.platform || stop.platform}</p>
              <p className="text-[10px] text-slate-400">Platform</p>
            </>
          ) : (
            <p className="text-[10px] text-slate-400">—</p>
          )}
        </div>
        <span
          className={cn(
            'text-xs font-bold w-16 text-right',
            live.delayMinutes > 0 ? 'text-rose-500' : 'text-emerald-600'
          )}
        >
          {live.delayMinutes > 0 ? `+${live.delayMinutes}m` : 'On time'}
        </span>
      </div>
    </Link>
  );
}
