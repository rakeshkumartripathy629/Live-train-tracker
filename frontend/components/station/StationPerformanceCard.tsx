'use client';

import React from 'react';
import { BarChart3, ShieldAlert } from 'lucide-react';
import { useStationPerformance } from '@/hooks/useStationIntelligence';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDelay } from '@/utils/format';

interface StationPerformanceCardProps {
  stationCode: string;
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export function StationPerformanceCard({ stationCode }: StationPerformanceCardProps) {
  const { data, isLoading, isError } = useStationPerformance(stationCode);

  if (isLoading) {
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-glass space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-glass text-center text-xs text-slate-400">
        Performance stats unavailable.
      </div>
    );
  }

  if (!data.available) {
    const reason =
      data.reason === 'INSUFFICIENT_DATA'
        ? `Not enough real observations yet (${data.sampleSize ?? 0}/${data.windowDays ? 'window' : '—'})`
        : data.reason === 'STATION_NOT_FOUND'
        ? 'Station not found'
        : 'Data unavailable';
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-glass">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-rail-blue" />
          <h2 className="font-bold text-slate-900 dark:text-white">Station Performance</h2>
        </div>
        <div className="flex items-start gap-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4">
          <ShieldAlert className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{reason}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {data.message ||
                'Real figures only appear once enough trains were observed at this station — no estimated or fabricated numbers are shown.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const s = data.stats!;
  const delayText = s.delay.count > 0 && s.delay.avgMinutes !== null ? formatDelay(s.delay.avgMinutes).text : '—';

  return (
    <div className="glass-panel rounded-3xl p-6 shadow-glass">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-rail-blue" />
          <h2 className="font-bold text-slate-900 dark:text-white">Station Performance</h2>
        </div>
        <span className="text-[11px] text-slate-400">Last {data.windowDays} days · {data.sampleSize} observations</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Trains" value={String(s.trainCount)} sub="distinct trains" />
        <StatBox label="Arrivals" value={String(s.arrivals)} />
        <StatBox label="Departures" value={String(s.departures)} />
        <StatBox
          label="Avg Delay"
          value={s.delay.count > 0 ? delayText : '—'}
          sub={s.delay.count > 0 ? `${s.delay.count} delay readings` : 'no delay data'}
        />
      </div>

      {s.delay.count > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Punctuality:{' '}
            <b className="text-emerald-600 dark:text-emerald-400">{s.punctualityPercent}%</b> on-time
          </span>
          <span>
            Delay range: <b className="font-mono">{s.delay.minMinutes}m → {s.delay.maxMinutes}m</b>
          </span>
        </div>
      )}
    </div>
  );
}
