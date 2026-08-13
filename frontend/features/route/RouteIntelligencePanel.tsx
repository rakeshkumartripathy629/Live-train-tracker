'use client';

import React from 'react';
import { Route, ShieldAlert, Gauge, Clock, MapPin } from 'lucide-react';
import { useRouteIntelligence } from '@/hooks/useStationIntelligence';
import { Skeleton } from '@/components/ui/Skeleton';
import { RouteSegment } from '@/types/station';
import { cn } from '@/utils/cn';

interface RouteIntelligencePanelProps {
  trainId: string;
}

function fmtSeg(seg: RouteSegment) {
  const from = seg.from.code || '?';
  const to = seg.to.code || '?';
  return `${from} → ${to}`;
}

export function RouteIntelligencePanel({ trainId }: RouteIntelligencePanelProps) {
  const { data, isLoading, isError } = useRouteIntelligence(trainId);

  if (isLoading) {
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-glass space-y-3">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-glass text-center text-xs text-slate-400">
        Route intelligence unavailable.
      </div>
    );
  }

  if (!data.available) {
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-glass">
        <div className="flex items-center gap-2 mb-3">
          <Route className="h-4 w-4 text-rail-blue" />
          <h2 className="font-bold text-slate-900 dark:text-white">Route Intelligence</h2>
        </div>
        <div className="flex items-start gap-3 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <ShieldAlert className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {data.reason === 'ROUTE_UNAVAILABLE' ? 'Route data unavailable' : 'Unavailable'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              No real route reference was returned for this train right now.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const segments = data.segments || [];
  const delays = data.stationDelays || [];

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-3xl p-6 shadow-glass">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-rail-blue" />
            <h2 className="font-bold text-slate-900 dark:text-white">Route Intelligence</h2>
          </div>
          <span className="text-[11px] text-slate-400">
            {data.train?.number} · {data.totalStops} stops · last {data.windowDays} days
          </span>
        </div>

        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="px-6 py-2 font-bold">Segment</th>
                <th className="px-3 py-2 font-bold">Distance</th>
                <th className="px-3 py-2 font-bold">Sch. Time</th>
                <th className="px-6 py-2 font-bold">Avg Speed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {segments.map((seg, i) => (
                <tr key={i}>
                  <td className="px-6 py-2.5 font-mono font-bold text-slate-700 dark:text-slate-200">
                    {fmtSeg(seg)}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-slate-500">
                    {seg.distanceKm !== null ? `${seg.distanceKm} km` : '—'}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-slate-500">
                    {seg.scheduledMinutes !== null ? `${Math.round(seg.scheduledMinutes)}m` : '—'}
                  </td>
                  <td className="px-6 py-2.5">
                    {seg.avgSpeedKmph !== null ? (
                      <span className="inline-flex items-center gap-1 font-bold text-rail-blue">
                        <Gauge className="h-3.5 w-3.5" />
                        {seg.avgSpeedKmph} km/h
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
              {segments.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                    No real route segments available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400">
          <Clock className="h-3 w-3" />
          Segment speeds are aggregated from real scheduled times and distances — never estimates.
        </p>
      </div>

      {delays.length > 0 && (
        <div className="glass-panel rounded-3xl p-6 shadow-glass">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-rail-blue" />
              <h2 className="font-bold text-slate-900 dark:text-white">Delay by Station</h2>
            </div>
            <span className="text-[11px] text-slate-400">
              real observations · min sample {data.minDelaySample}
            </span>
          </div>
          <div className="space-y-2">
            {delays.map((d) => (
              <div
                key={d.stationCode}
                className="flex items-center justify-between rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 px-4 py-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs font-bold text-rail-blue">{d.stationCode}</span>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                    {d.stationName || d.stationCode}
                  </span>
                  <span className="text-[10px] text-slate-400">n={d.sampleSize}</span>
                </div>
                <span
                  className={cn(
                    'text-xs font-bold',
                    d.delay.avgMinutes > 0 ? 'text-rose-500' : 'text-emerald-600'
                  )}
                >
                  {d.delay.avgMinutes > 0 ? `+${d.delay.avgMinutes}m avg` : `${d.delay.avgMinutes}m avg`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
