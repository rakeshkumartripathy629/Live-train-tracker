'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Clock, Gauge, MapPin, Navigation } from 'lucide-react';
import { LiveJourney } from '@/types/train';
import { TrainAvatar } from '@/components/ui/TrainAvatar';
import { LiveBadge, liveStateFromTimestamp } from '@/components/ui/LiveBadge';
import { cn } from '@/utils/cn';

interface MobileJourneySummaryProps {
  journey: LiveJourney;
}

export function MobileJourneySummary({ journey }: MobileJourneySummaryProps) {
  const progress = Math.min(journey.completionPercentage, 100);
  const liveState = liveStateFromTimestamp(journey.lastUpdated);
  const delayPositive = journey.delayMinutes > 0;
  const current = journey.currentStation || journey.previousStation;

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="md:hidden card-surface relative overflow-hidden rounded-2xl p-4 space-y-3.5"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-rail-gradient" />

      {/* Train identity */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <TrainAvatar number={journey.number} size="sm" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Live Journey
            </p>
            <h2 className="truncate font-bold text-sm text-slate-900 dark:text-white">{journey.name}</h2>
            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400 truncate">
              <span>{journey.origin.code}</span>
              <Arrow />
              <span>{journey.destination.code}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          <LiveBadge state={liveState} />
          <span
            className={cn(
              'tnum rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
              delayPositive
                ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            )}
          >
            {delayPositive ? `+${journey.delayMinutes} min` : 'On time'}
          </span>
        </div>
      </div>

      {/* Current → Next */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/50">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <MapPin className="h-3 w-3 text-emerald-500" /> Current
          </p>
          <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
            {current?.name || 'In Transit'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/50">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <Navigation className="h-3 w-3 text-rail-blue" /> Next
          </p>
          <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
            {journey.nextStation?.name || '—'}
          </p>
          <p className="text-[10px] text-slate-400">ETA {journey.nextStation?.scheduledArrival || '--:--'}</p>
        </div>
      </div>

      {/* Progress bar with train marker */}
      <div>
        <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 mb-1">
          <span className="truncate">{journey.origin.code}</span>
          <span className="tnum flex-shrink-0 font-mono font-bold text-rail-blue">{progress.toFixed(0)}%</span>
          <span className="truncate">{journey.destination.code}</span>
        </div>
        <div className="relative h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-visible">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="h-full rounded-full bg-rail-gradient"
          />
          <motion.span
            initial={{ left: '0%' }}
            animate={{ left: `${progress}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="absolute top-1/2 -ml-2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-rail-blue text-white shadow ring-2 ring-white dark:ring-slate-900"
            aria-hidden
          >
            <Gauge className="h-2 w-2" />
          </motion.span>
        </div>
      </div>

      {/* Live stats row */}
      <div className="flex items-center gap-3">
        {[
          { icon: Gauge, value: `${journey.speedKmh} km/h`, label: 'Speed' },
          { icon: Activity, value: `${journey.distanceCoveredKm} km`, label: 'Covered' },
          { icon: Clock, value: journey.ETA, label: 'ETA' },
        ].map(({ icon: Icon, value, label }) => (
          <div key={label} className="flex-1 flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="tnum truncate font-mono text-[11px] font-bold text-slate-900 dark:text-white">{value}</p>
              <p className="text-[10px] text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function Arrow() {
  return <span aria-hidden className="text-slate-400">→</span>;
}
