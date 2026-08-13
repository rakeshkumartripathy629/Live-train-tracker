'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, ArrowLeft, ShieldAlert } from 'lucide-react';
import { StationSearchInput } from '@/components/between/StationSearchInput';
import { Station, StationDetail } from '@/types/station';
import { StationConnectionState } from '@/hooks/useStationStream';
import { cn } from '@/utils/cn';

interface StationPageHeaderProps {
  detail: StationDetail | undefined;
  isLoading: boolean;
  streamState: StationConnectionState;
}

function streamLabel(state: StationConnectionState) {
  switch (state) {
    case 'CONNECTED':
      return { dot: 'bg-emerald-500', text: 'Live' };
    case 'CONNECTING':
    case 'RECONNECTING':
      return { dot: 'bg-amber-400 animate-pulse', text: 'Connecting' };
    case 'ERROR':
      return { dot: 'bg-rose-500', text: 'Unavailable' };
    default:
      return { dot: 'bg-slate-400', text: 'Offline' };
  }
}

export function StationPageHeader({ detail, isLoading, streamState }: StationPageHeaderProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const live = streamLabel(streamState);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => router.push('/station')}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-rail-blue transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Station Board
        </button>

        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold capitalize',
            live.dot === 'bg-emerald-500'
              ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400'
              : live.dot === 'bg-rose-500'
              ? 'bg-rose-500/15 text-rose-600 border-rose-500/30'
              : 'bg-slate-500/15 text-slate-500 border-slate-500/30'
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', live.dot)} />
          {live.text}
        </span>
      </div>

      <div className="glass-panel rounded-3xl p-6 shadow-glass flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-rail-blue/10 text-rail-blue">
            <MapPin className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            {isLoading && !detail ? (
              <div className="space-y-1.5">
                <div className="h-5 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-4 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ) : detail ? (
              <>
                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white truncate">
                  {detail.name}
                  <span className="ml-2 font-mono text-sm text-rail-blue align-middle">{detail.code}</span>
                </h1>
                {detail.verified ? (
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Verified reference — coordinates available
                  </p>
                ) : (
                  <p className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Verified station reference (code + name only — no coordinates)
                  </p>
                )}
              </>
            ) : (
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Station</h1>
            )}
          </div>
        </div>

        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3 text-xs font-bold text-slate-400 hover:text-rail-blue transition-colors sm:w-64"
          >
            Switch station…
          </button>
        )}
        {open && (
          <div className="sm:w-72">
            <StationSearchInput
              label=""
              value=""
              onSelect={(s: Station) => {
                setOpen(false);
                router.push(`/stations/${s.code}`);
              }}
              onClear={() => setOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
