'use client';

import React, { useEffect, useState } from 'react';
import { CloudSun, ShieldAlert } from 'lucide-react';
import { StationDetail } from '@/types/station';
import { WeatherData } from '@/lib/openweather';
import { WeatherCard } from '@/features/weather/WeatherCard';

interface StationWeatherCardProps {
  detail: StationDetail | undefined;
}

/**
 * Weather for a station is only shown when the station has VERIFIED coordinates
 * — the real data source provides none today, so this honestly reports
 * "coordinates unavailable" instead of guessing a location.
 */
export function StationWeatherCard({ detail }: StationWeatherCardProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const hasCoords =
    detail && typeof detail.lat === 'number' && typeof detail.lng === 'number' && detail.verified;

  useEffect(() => {
    let cancelled = false;
    if (!hasCoords) {
      setState('idle');
      return;
    }
    setState('loading');
    fetch(
      `/api/weather?lat=${detail.lat}&lng=${detail.lng}&name=${encodeURIComponent(detail.name)}&code=${detail.code}`
    )
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json && json.data) {
          setWeather(json.data);
          setState('ready');
        } else {
          setState('error');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [detail, hasCoords]);

  if (!hasCoords) {
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-glass">
        <div className="flex items-center gap-2 mb-3">
          <CloudSun className="h-4 w-4 text-amber-500" />
          <h2 className="font-bold text-slate-900 dark:text-white">Station Weather</h2>
        </div>
        <div className="flex items-start gap-3 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <ShieldAlert className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Coordinates unavailable</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              This station has no verified coordinates from the real data source, so weather cannot be
              requested for an honest location.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-glass text-center text-xs text-slate-400">
        Loading weather…
      </div>
    );
  }

  if (state === 'ready' && weather) {
    return (
      <div className="glass-panel rounded-3xl p-6 shadow-glass">
        <div className="flex items-center gap-2 mb-3">
          <CloudSun className="h-4 w-4 text-amber-500" />
          <h2 className="font-bold text-slate-900 dark:text-white">Station Weather</h2>
        </div>
        <WeatherCard label="Current Weather" weather={weather} />
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-3xl p-6 shadow-glass text-center text-xs text-slate-400">
      Weather temporarily unavailable.
    </div>
  );
}
