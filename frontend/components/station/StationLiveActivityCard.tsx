'use client';

import React from 'react';
import Link from 'next/link';
import { Radio, AlertTriangle, MoveRight } from 'lucide-react';
import { useStationStream } from '@/hooks/useStationStream';
import { StationStreamEvent } from '@/types/station';
import { formatTimeAgo } from '@/utils/format';
import { cn } from '@/utils/cn';

interface StationLiveActivityCardProps {
  stationCode: string;
}

function activityStyle(type: string) {
  switch (type) {
    case 'STATION_TRAIN_ARRIVED':
      return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400';
    case 'STATION_TRAIN_DEPARTED':
      return 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-400';
    case 'STATION_TRAIN_AT_STATION':
      return 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400';
    default:
      return 'bg-slate-500/15 text-slate-500 border-slate-500/30 dark:text-slate-400';
  }
}

function ActivityRow({ event }: { event: StationStreamEvent }) {
  const label =
    event.type === 'STATION_TRAIN_ARRIVED'
      ? 'Arrived'
      : event.type === 'STATION_TRAIN_DEPARTED'
      ? 'Departed'
      : event.type === 'STATION_TRAIN_AT_STATION'
      ? 'At platform'
      : 'Updated';

  return (
    <Link
      href={event.trainNumber ? `/train/${event.trainNumber}` : '#'}
      className="group flex items-center justify-between gap-3 rounded-2xl px-4 py-3 transition-all hover:bg-rail-blue/5"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-rail-blue/10 text-rail-blue group-hover:bg-rail-blue group-hover:text-white transition-colors">
          <Radio className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {event.trainNumber && (
              <span className="font-mono text-[11px] font-bold text-rail-blue">{event.trainNumber}</span>
            )}
            <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {event.trainName || 'Train'}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize',
                activityStyle(event.type)
              )}
            >
              {label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
            {event.platform && <span>PF {event.platform}</span>}
            {typeof event.delayMinutes === 'number' && (
              <span className={event.delayMinutes > 0 ? 'font-bold text-rose-500' : 'font-semibold text-emerald-600'}>
                {event.delayMinutes > 0 ? `+${event.delayMinutes}m` : 'On time'}
              </span>
            )}
            {event.observedAt && <span>{formatTimeAgo(event.observedAt)}</span>}
          </div>
        </div>
      </div>
      <MoveRight className="h-4 w-4 text-slate-300 group-hover:text-rail-blue flex-shrink-0" />
    </Link>
  );
}

export function StationLiveActivityCard({ stationCode }: StationLiveActivityCardProps) {
  const { isLive, liveActivity, events } = useStationStream(stationCode);

  const lastArrival = liveActivity.filter((e) => e.type === 'STATION_TRAIN_ARRIVED')[0];
  const lastDeparture = liveActivity.filter((e) => e.type === 'STATION_TRAIN_DEPARTED')[0];

  return (
    <div className="glass-panel rounded-3xl overflow-hidden shadow-glass">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400')} />
          <h2 className="font-bold text-slate-900 dark:text-white">Live Activity</h2>
        </div>
        <span className="text-[11px] text-slate-400">{events.length} recent events</span>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
        {!isLive && (
          <p className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Real-time feed is not connected right now.
          </p>
        )}

        {isLive && liveActivity.length === 0 && (
          <p className="py-8 text-center text-xs text-slate-400">
            Tracking live — arrivals/departures yahan real-time me dikhengi.
          </p>
        )}

        {liveActivity.slice(0, 6).map((e) => (
          <ActivityRow key={e.trainNumber} event={e} />
        ))}
      </div>

      {(lastArrival || lastDeparture) && (
        <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400">
          <span className="font-bold text-emerald-500">
            {lastArrival ? `Last arrival: ${lastArrival.trainName || lastArrival.trainNumber}` : ''}
          </span>
          {lastArrival && lastDeparture && <span>·</span>}
          <span className="font-bold text-sky-500">
            {lastDeparture ? `Last departure: ${lastDeparture.trainName || lastDeparture.trainNumber}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
