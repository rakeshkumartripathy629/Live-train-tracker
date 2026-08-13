'use client';

import React from 'react';
import { MapPin, ShieldAlert } from 'lucide-react';
import { useStationNearby } from '@/hooks/useStationIntelligence';
import { Skeleton } from '@/components/ui/Skeleton';

interface NearbyStationsCardProps {
  stationCode: string;
}

export function NearbyStationsCard({ stationCode }: NearbyStationsCardProps) {
  const { data, isLoading, isError } = useStationNearby(stationCode);

  if (isLoading) {
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-glass space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-glass text-center text-xs text-slate-400">
        Nearby stations unavailable.
      </div>
    );
  }

  if (!data.available) {
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-glass">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="h-4 w-4 text-rail-blue" />
          <h2 className="font-bold text-slate-900 dark:text-white">Nearby Stations</h2>
        </div>
        <div className="flex items-start gap-3 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <ShieldAlert className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {data.reason === 'COORDINATES_UNAVAILABLE'
                ? 'No verified coordinates'
                : data.reason === 'STATION_NOT_FOUND'
                ? 'Station not found'
                : 'Unavailable'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {data.message ||
                'The real data source provides no verified station coordinates, so nearby stations cannot be computed honestly. No estimated positions are shown.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-3xl p-6 shadow-glass">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-rail-blue" />
          <h2 className="font-bold text-slate-900 dark:text-white">Nearby Stations</h2>
        </div>
        <span className="text-[11px] text-slate-400">within {data.radiusKm} km</span>
      </div>
      <div className="space-y-2">
        {(data.stations || []).map((s) => (
          <div
            key={s.code}
            className="flex items-center justify-between rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-rail-blue">{s.code}</span>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{s.name}</span>
            </div>
            {s.distanceKm !== null && <span className="text-xs font-bold text-slate-400">{s.distanceKm} km</span>}
          </div>
        ))}
        {(data.stations || []).length === 0 && (
          <p className="py-6 text-center text-xs text-slate-400">No nearby stations found.</p>
        )}
      </div>
    </div>
  );
}
