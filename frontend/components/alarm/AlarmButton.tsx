'use client';

import React, { useState } from 'react';
import { Bell, X, Loader2, Check } from 'lucide-react';
import { useAlarms } from '@/hooks/useAlarms';
import { LiveJourney } from '@/types/train';
import { cn } from '@/utils/cn';
import { AnimatePresence, motion } from 'framer-motion';

interface AlarmButtonProps {
  journey: LiveJourney;
  variant?: 'icon' | 'full';
}

const DISTANCES = [10, 20, 50, 100];

export function AlarmButton({ journey, variant = 'full' }: AlarmButtonProps) {
  const [open, setOpen] = useState(false);
  const [stationCode, setStationCode] = useState('');
  const [distance, setDistance] = useState(20);
  const [mode, setMode] = useState<'distance' | 'arrival'>('distance');
  const [saved, setSaved] = useState(false);
  const { createAlarm, isLoading } = useAlarms();

  const upcomingStations = journey.stations.filter((s) => s.status === 'upcoming' || s.status === 'current');

  const submit = async () => {
    const station = journey.stations.find((s) => s.code === stationCode);
    if (!station) return;
    await createAlarm.mutateAsync({
      trainNumber: journey.number,
      trainName: journey.name,
      stationCode: station.code,
      stationName: station.name,
      distanceKm: distance,
      mode,
    });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setOpen(false);
    }, 1200);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors',
          variant === 'icon' && 'h-9 w-9 justify-center p-0'
        )}
        title="Notify me when train is near my station"
      >
        <Bell className="h-4 w-4" />
        {variant === 'full' && <span className="hidden sm:inline">Notify Me</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-glass-hover space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <Bell className="h-5 w-5 text-rail-blue" />
                  Train Alert
                </h3>
                <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {journey.name} (#{journey.number}) — jab train aapke station ke paas pahuche to alert.
              </p>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Station
                </label>
                <select
                  value={stationCode}
                  onChange={(e) => setStationCode(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 py-3 px-4 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rail-blue/40"
                >
                  <option value="">Select your station...</option>
                  {upcomingStations.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code}) · arr {s.scheduledArrival}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Alert when
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setMode('distance')}
                    className={cn(
                      'rounded-xl px-3 py-2.5 text-xs font-bold transition-colors border',
                      mode === 'distance'
                        ? 'bg-rail-blue text-white border-rail-blue'
                        : 'bg-slate-100 dark:bg-slate-800 border-transparent text-slate-500'
                    )}
                  >
                    Train is X km away
                  </button>
                  <button
                    onClick={() => setMode('arrival')}
                    className={cn(
                      'rounded-xl px-3 py-2.5 text-xs font-bold transition-colors border',
                      mode === 'arrival'
                        ? 'bg-rail-blue text-white border-rail-blue'
                        : 'bg-slate-100 dark:bg-slate-800 border-transparent text-slate-500'
                    )}
                  >
                    Train arrives
                  </button>
                </div>
              </div>

              {mode === 'distance' && (
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                    Distance: {distance} km
                  </label>
                  <div className="flex gap-2">
                    {DISTANCES.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDistance(d)}
                        className={cn(
                          'flex-1 rounded-xl py-2 text-xs font-bold transition-colors',
                          distance === d
                            ? 'bg-rail-blue text-white shadow-glow'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        )}
                      >
                        {d} km
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={submit}
                disabled={!stationCode || isLoading}
                className={cn(
                  'w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold transition-all',
                  saved
                    ? 'bg-emerald-500 text-white'
                    : stationCode && !isLoading
                    ? 'bg-rail-blue text-white shadow-glow hover:bg-sky-600 active:scale-95'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saved ? (
                  <>
                    <Check className="h-4 w-4" /> Alarm Set!
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4" /> Set Alarm
                  </>
                )}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
