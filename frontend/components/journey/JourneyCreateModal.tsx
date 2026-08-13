'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { X, Loader2, Luggage, ArrowRight, LogIn, AlertCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTrainRoute } from '@/hooks/useTrainRoute';
import { useUserId } from '@/lib/user';
import { apiClient } from '@/lib/api-client';
import { Journey } from '@/types/journey';
import { istDateString, addDaysIST } from '@/lib/ist';
import { cn } from '@/utils/cn';
import { Skeleton } from '@/components/ui/Skeleton';

interface JourneyCreateModalProps {
  trainId: string;
  trainName: string;
  open: boolean;
  onClose: () => void;
}

export function JourneyCreateModal({ trainId, trainName, open, onClose }: JourneyCreateModalProps) {
  const router = useRouter();
  const userId = useUserId();
  const { data: routeData, isLoading } = useTrainRoute(trainId);

  const [boardingCode, setBoardingCode] = useState('');
  const [destCode, setDestCode] = useState('');
  const [journeyDate, setJourneyDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const halts = routeData?.route || [];
  const boardingIdx = halts.findIndex((h) => h.station?.code === boardingCode);
  const destinationOptions =
    boardingIdx >= 0 ? halts.filter((_, i) => i > boardingIdx) : halts;

  const canSubmit = boardingCode && destCode && journeyDate && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const journey = await apiClient<Journey>('/api/journeys', {
        method: 'POST',
        body: {
          trainNumber: trainId,
          boardingStationCode: boardingCode,
          destinationStationCode: destCode,
          journeyDate,
        },
      });
      onClose();
      router.push(`/journeys/${journey.id}`);
    } catch (err: any) {
      setError(err?.message || 'Journey create nahi ho paya. Dobara try karo.');
      setSubmitting(false);
    }
  };

  const boardingStation = halts[boardingIdx];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-glass-hover space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <Luggage className="h-5 w-5 text-rail-blue" />
                Track Journey
              </h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {trainName} (#{trainId}) — boarding aur destination station chuno. Live tracking
              RailRadar ke real data se milega.
            </p>

            {!userId ? (
              <div className="rounded-2xl border border-rail-blue/20 bg-rail-blue/5 p-4 space-y-3 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-rail-blue/10 text-rail-blue">
                  <LogIn className="h-5 w-5" />
                </div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  Sign in to track this journey
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Journeys aapke account me save honge aur har device par available rahenge.
                </p>
                <Link
                  href="/login"
                  onClick={onClose}
                  className="block w-full rounded-xl bg-rail-blue px-3 py-2.5 text-sm font-bold text-white shadow-glow hover:bg-sky-600 transition-colors"
                >
                  Sign In
                </Link>
                <p className="text-xs text-slate-400">
                  New here?{' '}
                  <Link href="/register" onClick={onClose} className="font-bold text-rail-blue hover:underline">
                    Create account
                  </Link>
                </p>
              </div>
            ) : isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full rounded-2xl" />
                <Skeleton className="h-12 w-full rounded-2xl" />
                <Skeleton className="h-12 w-full rounded-2xl" />
              </div>
            ) : (
              <>
                {/* Boarding station */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                    Boarding Station
                  </label>
                  <select
                    value={boardingCode}
                    onChange={(e) => {
                      setBoardingCode(e.target.value);
                      setDestCode('');
                    }}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 py-3 px-4 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rail-blue/40"
                  >
                    <option value="">Select boarding station...</option>
                    {halts.map((h) => (
                      <option key={h.station?.code} value={h.station?.code}>
                        {h.station?.name} ({h.station?.code}) · {h.distance} km · dep {h.departure || '--:--'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Destination station */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                    Destination Station
                  </label>
                  <select
                    value={destCode}
                    onChange={(e) => setDestCode(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 py-3 px-4 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rail-blue/40"
                  >
                    <option value="">Select destination station...</option>
                    {destinationOptions.map((h) => (
                      <option key={h.station?.code} value={h.station?.code}>
                        {h.station?.name} ({h.station?.code}) · {h.distance} km · arr {h.arrival || '--:--'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Journey date */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                    Journey Date
                  </label>
                  <input
                    type="date"
                    value={journeyDate}
                    min={istDateString()}
                    max={addDaysIST(30)}
                    onChange={(e) => setJourneyDate(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 py-3 px-4 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rail-blue/40"
                  />
                </div>

                {/* Preview */}
                {boardingStation && destCode && (
                  <div className="flex items-center gap-2.5 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800/60 dark:bg-slate-900/50">
                    <div className="flex flex-col items-center">
                      <span className="h-2 w-2 rounded-full bg-rail-blue" />
                      <span className="my-0.5 h-6 w-px bg-slate-300 dark:bg-slate-700" />
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    </div>
                    <div className="text-xs">
                      <p className="font-bold text-slate-900 dark:text-white">
                        {boardingStation.station?.name} ({boardingStation.station?.code})
                        <ArrowRight className="inline h-3 w-3 mx-1 text-slate-400" />
                        {halts.find((h) => h.station?.code === destCode)?.station?.name} ({destCode})
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                        {journeyDate} · {trainName}
                      </p>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-600 dark:text-rose-400">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={submit}
                  disabled={!canSubmit}
                  className={cn(
                    'w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold transition-all',
                    canSubmit
                      ? 'bg-rail-blue text-white shadow-glow hover:bg-sky-600 active:scale-95'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  )}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Luggage className="h-4 w-4" /> Start Tracking
                    </>
                  )}
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
