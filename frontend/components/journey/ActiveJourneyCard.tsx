'use client';

import React from 'react';
import Link from 'next/link';
import {
  MapPin,
  Radio,
  Navigation,
  ArrowRight,
  Map,
  CalendarDays,
} from 'lucide-react';
import { Journey } from '@/types/journey';
import { LiveJourney, Station } from '@/types/train';
import { StatusBadge } from '@/components/journey/StatusBadge';
import { DelayBadge } from '@/components/journey/DelayBadge';
import { ProgressRing } from '@/components/journey/ProgressRing';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatTimeAgo } from '@/utils/format';

function journeyProgress(journey: Journey, stations: Station[]): number | null {
  const boarding = stations.find((s) => s.code === journey.boardingStationCode);
  const dest = stations.find((s) => s.code === journey.destinationStationCode);
  if (!boarding || !dest || dest.distanceKm <= boarding.distanceKm) return null;
  const current =
    stations.find((s) => s.status === 'current')?.distanceKm ||
    stations.find((s) => s.status === 'passed')?.distanceKm ||
    0;
  const pct = ((current - boarding.distanceKm) / (dest.distanceKm - boarding.distanceKm)) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

interface ActiveJourneyCardProps {
  journey: Journey;
  live: LiveJourney | undefined;
  isLoading: boolean;
}

export function ActiveJourneyCard({ journey, live, isLoading }: ActiveJourneyCardProps) {
  const progress = live ? journeyProgress(journey, live.stations) : null;

  return (
    <div className="glass-panel relative overflow-hidden rounded-3xl p-6 shadow-glass border border-emerald-500/20">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-lg bg-rail-blue/10 px-2.5 py-1 font-mono text-xs font-bold text-rail-blue">
              #{journey.trainNumber}
            </span>
            {!isLoading && live ? (
              <StatusBadge status={live.status} />
            ) : (
              <StatusBadge status="unavailable" />
            )}
          </div>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {journey.trainName}
          </h2>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <CalendarDays className="h-3.5 w-3.5" />
            {journey.journeyDate} · Your journey:
            <span className="text-slate-700 dark:text-slate-200 font-bold">
              {journey.boardingStationName} ({journey.boardingStationCode})
            </span>
            <ArrowRight className="h-3 w-3" />
            <span className="text-slate-700 dark:text-slate-200 font-bold">
              {journey.destinationStationName} ({journey.destinationStationCode})
            </span>
          </p>
        </div>

        {!isLoading && live && (
          <div className="flex items-center gap-3">
            <DelayBadge delayMinutes={live.delayMinutes} />
            <ProgressRing progress={progress ?? live.completionPercentage} size={62} strokeWidth={6} />
          </div>
        )}
      </div>

      {/* Live grid */}
      {isLoading ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : live ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/50">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Current / Last Station
              </span>
              <p className="font-semibold text-slate-900 dark:text-white truncate">
                {live.currentStation?.name || live.previousStation?.name || 'In Transit'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/50">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-rail-blue/10 text-rail-blue">
              <Radio className="h-5 w-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Next Station
              </span>
              <p className="font-semibold text-slate-900 dark:text-white truncate">
                {live.nextStation?.name || '—'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Arr {live.nextStation?.scheduledArrival || '--:--'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/50">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Navigation className="h-5 w-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                ETA
              </span>
              <p className="font-semibold text-slate-900 dark:text-white truncate">{live.ETA}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {progress !== null ? `${progress}% journey complete` : `${live.completionPercentage}% route covered`}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
          <MapPin className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
              Live information temporarily unavailable
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              RailRadar se data nahi mil paya — koi fake status nahi dikhaya ja raha. Dobara koshish karein.
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-slate-400">
          {live
            ? `Updated ${formatTimeAgo(live.lastUpdated)} · auto-refresh every 30s`
            : 'Live status pending'}
        </span>
        <Link
          href={`/journeys/${journey.id}`}
          className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-4 py-2 text-xs font-bold text-white shadow-glow hover:bg-sky-600 transition-colors"
        >
          <Map className="h-4 w-4" />
          View Live Map
        </Link>
      </div>
    </div>
  );
}
