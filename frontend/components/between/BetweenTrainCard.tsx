'use client';

import React from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Clock, Train, MapPin, MoveRight, CalendarDays, CheckCircle2 } from 'lucide-react';
import { BetweenTrain } from '@/types/station';
import { apiRequest } from '@/lib/api';
import { LiveJourney } from '@/types/train';
import { cn } from '@/utils/cn';
import { classifyBetween, TRAIN_STATUS_META, TrainStatus } from '@/lib/train-status';

function runDaysLabel(days: string[]): string {
  if (!days || days.length === 0) return '';
  if (days.length === 7) return 'Daily';
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return days
    .map((d) => order.indexOf(d))
    .sort((a, b) => a - b)
    .map((i) => order[i][0].toUpperCase())
    .join('');
}

function durationLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m > 0 ? m + 'm' : ''}`.trim() : `${m}m`;
}

function statusContext(status: TrainStatus, train: BetweenTrain): string {
  const platform = train.live?.platform || '';
  if (status === 'UPCOMING') return platform ? `Platform ${platform}` : `Departure ${train.from.departure}`;
  if (status === 'DEPARTED') return platform ? `Departed from Platform ${platform}` : 'Left source station';
  if (status === 'COMPLETED') return 'Journey finished';
  return 'Live status unavailable';
}

export function BetweenTrainCard({ train }: { train: BetweenTrain }) {
  const queryClient = useQueryClient();

  // Warm the live-tracking page cache before the user even clicks, so the
  // train page opens instantly with data already visible.
  const prefetchLive = () => {
    if (!train.number) return;
    queryClient.prefetchQuery({
      queryKey: ['liveJourney', train.number],
      queryFn: () => apiRequest<LiveJourney>(`/trains/${train.number}/live`),
      staleTime: 10 * 1000,
    });
  };

  const status = classifyBetween(train);
  const meta = TRAIN_STATUS_META[status];
  const isUpcoming = status === 'UPCOMING';
  const isDeparted = status === 'DEPARTED';
  const isCompleted = status === 'COMPLETED';

  const live = train.live;
  const delay = live?.delayMinutes ?? 0;
  const hasDelay = Number.isFinite(delay) && delay > 0;

  return (
    <Link
      href={`/train/${train.number}`}
      onMouseEnter={prefetchLive}
      onFocus={prefetchLive}
      onTouchStart={prefetchLive}
      className="glass-panel group rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glass-hover"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-rail-blue/10 text-rail-blue group-hover:bg-rail-blue group-hover:text-white transition-colors">
            <Train className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">
                {train.number}
              </span>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">{train.name}</h4>
            </div>
            <span className="text-[11px] text-slate-400">{train.type}</span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
          <CalendarDays className="h-3 w-3" />
          {runDaysLabel(train.runDays)}
        </span>
      </div>

      <div
        role="status"
        className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 px-3 py-2"
      >
        <span
          aria-label={`Train status: ${meta.label}. ${meta.description}`}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold',
            meta.badge
          )}
        >
          {isCompleted ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
          )}
          {meta.label}
        </span>
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {statusContext(status, train)}
        </span>
      </div>

      <div className={cn('mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3', isCompleted && 'opacity-60')}>
        <div>
          <p className="font-mono text-lg font-extrabold text-slate-900 dark:text-white">{train.from.departure}</p>
          <p className="text-[11px] text-slate-400">{isDeparted ? 'Scheduled dep.' : 'Departure'}</p>
        </div>
        <div className="flex flex-col items-center text-slate-300 dark:text-slate-600">
          <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
            <Clock className="h-3 w-3" /> {durationLabel(train.duration)}
          </span>
          <MoveRight className="h-5 w-5" />
          <span className="text-[10px] text-slate-400">{Math.round(train.distance)} km</span>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-extrabold text-slate-900 dark:text-white">{train.to.arrival}</p>
          <p className="text-[11px] text-slate-400">Arrival</p>
        </div>
      </div>

      {live && !isCompleted && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-100/70 dark:bg-slate-800/70 px-3 py-2 text-[11px]">
          <span className="font-semibold text-slate-500 dark:text-slate-400">
            {live.expectedArrivalTime ? `Expected arrival: ${live.expectedArrivalTime}` : 'Live update'}
          </span>
          <span
            className={cn(
              'font-bold',
              hasDelay ? 'text-rose-500' : 'text-emerald-600'
            )}
          >
            {hasDelay
              ? isDeparted
                ? `+${delay}m late`
                : `+${delay}m delay`
              : 'On time'}
          </span>
        </div>
      )}

      {!isCompleted && (
        <div className="mt-3 flex items-center justify-end gap-1 text-[11px] font-bold text-rail-blue">
          Track live
          <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
        </div>
      )}
    </Link>
  );
}
