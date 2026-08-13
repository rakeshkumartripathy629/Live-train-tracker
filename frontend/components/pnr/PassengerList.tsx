'use client';

import React from 'react';
import { PnrPassenger } from '@/types/pnr';
import { cn } from '@/utils/cn';

interface PassengerListProps {
  passengers: PnrPassenger[];
  probability: number;
}

const TYPE_STYLE: Record<string, { label: string; badge: string; dot: string }> = {
  CNF: {
    label: 'Confirmed',
    badge: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  RAC: {
    label: 'RAC',
    badge: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  WL: {
    label: 'Waiting',
    badge: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-400',
    dot: 'bg-rose-500',
  },
};

function statusStyle(type: string) {
  return TYPE_STYLE[type] || TYPE_STYLE.WL;
}

function probabilityColor(p: number): string {
  if (p >= 70) return 'bg-emerald-500';
  if (p >= 40) return 'bg-amber-500';
  return 'bg-rose-500';
}

export function PassengerList({ passengers, probability }: PassengerListProps) {
  return (
    <div className="glass-panel rounded-3xl p-6 shadow-glass space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-base text-slate-900 dark:text-white">Passengers</h3>
        <span className="text-xs font-semibold text-slate-500">
          {passengers.length} passenger{passengers.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Confirmation Probability
          </span>
          <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">{probability}%</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700', probabilityColor(probability))}
            style={{ width: `${probability}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {passengers.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">No passenger details available.</p>
        )}
        {passengers.map((p, i) => {
          const style = statusStyle(p.type);
          return (
            <div
              key={i}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-800 font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
                    P{i + 1}
                  </span>
                  <div>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      Booking: <b className="text-slate-700 dark:text-slate-200">{p.bookingStatus || '—'}</b>
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {p.bookingCoach && p.bookingBerth ? `${p.bookingCoach} · Berth ${p.bookingBerth}` : 'Berth —'}
                    </span>
                  </div>
                </div>
                <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold', style.badge)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
                  {p.currentStatus || style.label}
                </span>
              </div>
              {(p.currentCoach || p.currentBerth) && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="rounded-lg bg-rail-blue/10 px-2 py-0.5 font-mono font-bold text-rail-blue">
                    {p.currentCoach || '—'} · {p.currentBerth || '—'}
                  </span>
                  <span>Current berth</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
