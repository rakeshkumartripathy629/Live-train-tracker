'use client';

import React, { useState } from 'react';
import { MapPin, Calendar, Clock, RefreshCw } from 'lucide-react';
import { StationSearchInput } from '@/components/between/StationSearchInput';
import { useStationLiveBoard } from '@/hooks/useStationLiveBoard';
import { Station } from '@/types/station';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { LiveBoardRow } from '@/components/station/LiveBoardRow';
import { cn } from '@/utils/cn';

const HOUR_OPTIONS = [2, 4, 6, 8];

export function StationBoard() {
  const [station, setStation] = useState<Station | null>(null);
  const [hours, setHours] = useState(4);
  const [requested, setRequested] = useState<Station | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useStationLiveBoard(
    requested?.code || '',
    hours
  );

  return (
    <div className="space-y-6 py-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rail-blue/10 text-rail-blue">
          <MapPin className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Station Live Board</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Kisi bhi station pe abhi aane/jaane wali trains, platform aur delay
          </p>
        </div>
      </div>

      <div className="glass-panel rounded-3xl p-6 shadow-glass space-y-4">
        <StationSearchInput
          label="Select Station"
          value={station?.code || ''}
          onSelect={(s) => {
            setStation(s);
            setRequested(s);
          }}
          onClear={() => {
            setStation(null);
            setRequested(null);
          }}
        />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 mr-1">Window:</span>
            {HOUR_OPTIONS.map((h) => (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                  hours === h
                    ? 'bg-rail-blue text-white shadow-glow'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500 hover:text-rail-blue'
                )}
              >
                {h}h
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-3.5 py-2 text-xs font-semibold text-white shadow-glow transition-all hover:bg-sky-600 disabled:opacity-60"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState
          title="Board unavailable"
          description="Live board load nahi ho paya. RailRadar API key aur station code check karo."
          action={
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-4 py-2 text-xs font-semibold text-white shadow-glow"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          }
        />
      )}

      {data && (
        <div className="glass-panel rounded-3xl overflow-hidden shadow-glass">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-extrabold text-rail-blue">{data.station.code}</span>
              <h2 className="font-bold text-slate-900 dark:text-white">{data.station.name}</h2>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Calendar className="h-3.5 w-3.5" />
              {data.window.from} → {data.window.to}
              <span className="rounded-md bg-rail-blue/10 px-2 py-0.5 font-bold text-rail-blue">
                {data.count} trains
              </span>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {data.trains.map((t) => (
              <LiveBoardRow key={`${t.train.number}-${t.stop.sequence}`} item={t} />
            ))}
            {data.trains.length === 0 && (
              <p className="py-10 text-center text-xs text-slate-400">
                Is window me koi train nahi.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
