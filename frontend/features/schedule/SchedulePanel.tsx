'use client';

import React from 'react';
import { CalendarRange, Train } from 'lucide-react';
import { useTrainDetails } from '@/hooks/useTrainDetails';
import { TrainDetails as TrainDetailsType } from '@/types/station';
import { CoachPosition } from '@/components/pnr/CoachPosition';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/utils/cn';

interface SchedulePanelProps {
  trainId: string;
}

function dayLabel(day: number): string {
  return day > 1 ? `+${day - 1}` : '';
}

export function SchedulePanel({ trainId }: SchedulePanelProps) {
  const { data, isLoading, isError, error } = useTrainDetails(trainId);
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        title="Schedule unavailable"
        description={(error as Error)?.message || 'Train schedule load nahi ho paya. RailRadar API key check karo.'}
      />
    );
  }

  const details = data as TrainDetailsType;

  return (
    <div className="space-y-5">
      {details.train.coachPosition && <CoachPosition composition={details.train.coachPosition} />}

      <div className="glass-panel rounded-3xl p-6 shadow-glass space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-rail-blue" />
            Full Schedule
          </h3>
          <span className="text-xs text-slate-400">
            {details.train.totalHalts} halts · {Math.round(details.train.distance)} km ·{' '}
            {details.train.avgSpeed} km/h avg
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 pr-3 font-bold">#</th>
                <th className="py-2 pr-3 font-bold">Station</th>
                <th className="py-2 pr-3 font-bold text-right">Arr</th>
                <th className="py-2 pr-3 font-bold text-right">Dep</th>
                <th className="py-2 pr-3 font-bold text-right">Day</th>
                <th className="py-2 pr-3 font-bold text-right">Dist</th>
                <th className="py-2 font-bold text-right">Platform</th>
              </tr>
            </thead>
            <tbody>
              {details.route.map((stop, i) => (
                <tr
                  key={i}
                  className={cn(
                    'border-b border-slate-100 dark:border-slate-800/60 text-sm',
                    stop.isHalt ? '' : 'opacity-50'
                  )}
                >
                  <td className="py-2.5 pr-3 font-mono text-xs text-slate-400">{stop.sequence}</td>
                  <td className="py-2.5 pr-3">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {stop.station.name}
                    </span>
                    <span className="ml-2 font-mono text-[10px] text-rail-blue">{stop.station.code}</span>
                    {!stop.isHalt && (
                      <span className="ml-2 text-[10px] text-slate-400">pass</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono font-semibold text-slate-700 dark:text-slate-200">
                    {stop.arrival || '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono font-semibold text-slate-700 dark:text-slate-200">
                    {stop.departure || '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-xs text-slate-400">
                    {dayLabel(stop.departureDay || 1)}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-xs text-slate-400">
                    {Math.round(stop.distance)} km
                  </td>
                  <td className="py-2.5 text-right">
                    {stop.platform ? (
                      <span className="rounded-md bg-rail-blue/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rail-blue">
                        {stop.platform}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-700">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
