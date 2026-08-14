'use client';

import React from 'react';
import { Gauge, MapPin, RefreshCw, ArrowRight, Clock, Navigation } from 'lucide-react';
import { LiveJourney } from '@/types/train';
import { DelayBadge } from './DelayBadge';
import { ProgressRing } from './ProgressRing';
import { ETAChip } from './ETAChip';
import { TrainAvatar } from '@/components/ui/TrainAvatar';
import { LiveBadge, liveStateFromTimestamp } from '@/components/ui/LiveBadge';
import { formatDistance, formatTimeAgo } from '@/utils/format';
import { cn } from '@/utils/cn';

interface JourneyCardProps {
  journey: LiveJourney;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

export function JourneyCard({
  journey,
  onRefresh,
  isRefreshing,
  className,
}: JourneyCardProps) {
  const progress = Math.min(Math.max(journey.completionPercentage, 0), 100);
  const liveState = liveStateFromTimestamp(journey.lastUpdated);
  const current = journey.currentStation || journey.previousStation;

  return (
    <div
      className={cn(
        'card-surface relative overflow-hidden rounded-3xl p-5 sm:p-6',
        className
      )}
    >
      {/* top accent */}
      <div className="absolute inset-x-0 top-0 h-1 bg-rail-gradient" />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <TrainAvatar type={undefined} number={journey.number} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-rail-blue/10 px-2 py-0.5 font-mono text-xs font-bold text-rail-blue">
                #{journey.number}
              </span>
              <DelayBadge delayMinutes={journey.delayMinutes} />
              <LiveBadge state={liveState} />
            </div>
            <h2 className="mt-1.5 truncate text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              {journey.name}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span className="truncate">{journey.origin.name} ({journey.origin.code})</span>
              <ArrowRight className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{journey.destination.name} ({journey.destination.code})</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <ETAChip eta={journey.ETA} />
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Refresh Live Status"
              aria-label="Refresh live status"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin text-rail-blue')} />
            </button>
          )}
        </div>
      </div>

      {/* Current → Next */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/50">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Current / Last Station
              </span>
              <p className="truncate font-bold text-slate-900 dark:text-white">
                {current?.name || 'In Transit'}
              </p>
              {current?.platform && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Platform {current.platform}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/50">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-rail-blue">
              <Navigation className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Next Station
              </span>
              <p className="truncate font-bold text-slate-900 dark:text-white">
                {journey.nextStation?.name || '—'}
              </p>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                ETA {journey.nextStation?.scheduledArrival || '--:--'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <span className="truncate">{journey.origin.name}</span>
          <span className="tnum flex-shrink-0 px-2 font-mono font-bold text-rail-blue">
            {progress.toFixed(0)}%
          </span>
          <span className="truncate">{journey.destination.name}</span>
        </div>
        <div className="relative h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-rail-gradient transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-rail-blue shadow transition-all duration-700 dark:border-slate-900"
            style={{ left: `calc(${progress}% - 8px)` }}
            aria-hidden
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/60 dark:bg-slate-900/50">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-rail-blue/10 text-rail-blue">
            <Gauge className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Live Speed</p>
            <p className="tnum font-mono text-lg font-bold text-slate-900 dark:text-white">
              {journey.speedKmh}
              <span className="ml-0.5 text-xs font-semibold text-slate-500">km/h</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/60 dark:bg-slate-900/50">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Clock className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Distance Covered</p>
            <p className="tnum truncate font-mono text-sm font-bold text-slate-900 dark:text-white">
              {formatDistance(journey.distanceCoveredKm)}
              <span className="ml-0.5 text-xs font-semibold text-slate-500">/ {formatDistance(journey.totalDistanceKm)}</span>
            </p>
            <p className="truncate text-[10px] text-slate-400">
              {formatDistance(journey.remainingDistanceKm)} remaining
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/60 dark:bg-slate-900/50">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Journey Progress</p>
            <p className="tnum font-mono text-lg font-bold text-slate-900 dark:text-white">
              {progress.toFixed(0)}%
            </p>
          </div>
          <ProgressRing progress={progress} size={52} strokeWidth={5} />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', liveState === 'live' ? 'bg-emerald-500' : liveState === 'stale' ? 'bg-amber-500' : 'bg-slate-400')} aria-hidden />
          {liveState === 'live' ? 'Live feed active' : liveState === 'stale' ? 'Data stale' : 'Live updates unavailable'}
        </span>
        <span>Updated {formatTimeAgo(journey.lastUpdated)}</span>
      </div>
    </div>
  );
}
