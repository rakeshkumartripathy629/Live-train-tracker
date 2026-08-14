'use client';

import React from 'react';
import { CheckCircle2, Circle, Flag, Clock, MapPin } from 'lucide-react';
import { Station } from '@/types/train';
import { formatDelay } from '@/utils/format';
import { cn } from '@/utils/cn';

interface TimelineProps {
  stations: Station[];
  currentStationCode?: string;
  className?: string;
}

/**
 * Premium route timeline. Real data only — actual arrival/departure shown only
 * when the source provides it, platform / delay / halt shown verbatim.
 */
export function Timeline({ stations, currentStationCode, className }: TimelineProps) {
  const total = stations.length;
  const passedCount = stations.filter((s) => s.status === 'passed').length;
  const completion = total > 0 ? Math.round((passedCount / total) * 100) : 0;

  return (
    <div className={cn('card-surface rounded-3xl p-5 sm:p-6', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="rail-heading text-lg text-slate-900 dark:text-white">Station Route Timeline</h3>
        <span className="tnum rounded-full bg-rail-blue/10 px-2.5 py-1 font-mono text-[11px] font-bold text-rail-blue">
          {passedCount}/{total} · {completion}%
        </span>
      </div>

      {/* Completion bar */}
      <div className="mb-5">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-rail-gradient transition-all duration-500"
            style={{ width: `${completion}%` }}
          />
        </div>
      </div>

      <div className="relative pl-5 before:absolute before:bottom-4 before:left-[11px] before:top-4 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
        <div className="space-y-5">
          {stations.map((st, idx) => {
            const isPassed = st.status === 'passed';
            const isCurrent = st.status === 'current' || st.code === currentStationCode;
            const isUpcoming = st.status === 'upcoming';
            const delayInfo = formatDelay(st.delayMinutes);
            const isLast = idx === total - 1;

            return (
              <div key={st.code + idx} className="relative flex items-start justify-between gap-3">
                {/* Dot */}
                <div className="absolute -left-5 top-0.5 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-background">
                  {isPassed && <CheckCircle2 className="h-5 w-5 text-emerald-500 fill-emerald-500/15" />}
                  {isCurrent && (
                    <span className="relative flex h-5 w-5 items-center justify-center">
                      <span className="absolute h-5 w-5 rounded-full bg-rail-blue/25 live-dot text-rail-blue" aria-hidden />
                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rail-blue text-white">
                        <MapPin className="h-2 w-2" />
                      </span>
                    </span>
                  )}
                  {isUpcoming &&
                    (isLast ? (
                      <Flag className="h-4 w-4 text-rail-blue/70" />
                    ) : (
                      <Circle className="h-4 w-4 text-slate-300 dark:text-slate-700" />
                    ))}
                </div>

                {/* Station info */}
                <div className="min-w-0 flex-1 pl-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="tnum font-mono text-[10px] font-bold text-slate-300 dark:text-slate-600">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <h4
                      className={cn(
                        'font-bold truncate',
                        isCurrent
                          ? 'text-rail-blue text-base'
                          : isPassed
                          ? 'text-slate-800 dark:text-slate-200 text-sm'
                          : 'text-slate-500 dark:text-slate-400 text-sm'
                      )}
                    >
                      {st.name}
                      <span className="ml-1 font-mono text-[10px] text-slate-400">({st.code})</span>
                    </h4>

                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rail-blue/10 px-2 py-0.5 text-[10px] font-bold text-rail-blue">
                        <span className="h-1.5 w-1.5 rounded-full bg-rail-blue live-dot" aria-hidden />
                        LIVE LOCATION
                      </span>
                    )}

                    {st.platform && (
                      <span className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                        PF {st.platform}
                      </span>
                    )}
                  </div>

                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-medium text-slate-400">
                    <span>{st.distanceKm} km</span>
                    {st.haltMinutes ? <span>Halt {st.haltMinutes}m</span> : null}
                    {st.actualArrival || st.actualDeparture ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Actual {st.actualArrival || st.actualDeparture}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Time + delay */}
                <div className="tnum flex flex-shrink-0 flex-col items-end">
                  <span
                    className={cn(
                      'font-mono text-xs font-bold',
                      isCurrent
                        ? 'text-rail-blue'
                        : isPassed
                        ? 'text-slate-700 dark:text-slate-200'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    {st.scheduledArrival || st.scheduledDeparture || '—'}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1">
                    {st.delayMinutes > 0 ? (
                      <span className={cn('text-[11px] font-bold', delayInfo.color)}>+{st.delayMinutes}m</span>
                    ) : st.delayMinutes === 0 ? (
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        On Time
                      </span>
                    ) : null}
                    {st.scheduledArrival && <Clock className="h-3 w-3 text-slate-300 dark:text-slate-600" />}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
