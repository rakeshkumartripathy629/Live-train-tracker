'use client';

import React from 'react';
import Link from 'next/link';
import { Bell, Trash2, Train, MapPin } from 'lucide-react';
import { useAlarms } from '@/hooks/useAlarms';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDistance } from '@/utils/format';
import { RequireAuth } from '@/components/auth/RequireAuth';

export default function AlarmsPage() {
  const { alarms, isLoading, removeAlarm } = useAlarms();

  return (
    <RequireAuth>
      <div className="space-y-6 py-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
          <Bell className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">My Alerts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Train alarms — kab train aapke station ke paas pahuche, hum notify karenge
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-3xl" />
          ))}
        </div>
      )}

      {!isLoading && alarms.length === 0 && (
        <EmptyState
          title="No active alerts"
          description="Kisi train ke page pe 'Notify Me' se alarm set karo — jab train aapke station ke paas pahuche to alert milega."
          action={
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-4 py-2 text-xs font-semibold text-white shadow-glow hover:bg-sky-600 transition-colors"
            >
              <Train className="h-4 w-4" />
              Search Trains
            </Link>
          }
        />
      )}

      <div className="space-y-3">
        {alarms.map((alarm) => (
          <div
            key={alarm._id}
            className="glass-panel rounded-3xl p-5 flex items-center justify-between gap-4 shadow-glass"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-rail-blue">#{alarm.trainNumber}</span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  {alarm.trainName || 'Train'}
                </h3>
                {alarm.notifiedAt && (
                  <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                    Notified
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-rail-blue" />
                  {alarm.stationName || alarm.stationCode}
                </span>
                <span>
                  {alarm.mode === 'arrival'
                    ? 'Jab train arrive ho'
                    : `${formatDistance(alarm.distanceKm)} pehle`}
                </span>
                <span className="text-[11px] text-slate-400">
                  {alarm.createdAt ? new Date(alarm.createdAt).toLocaleDateString('en-IN') : ''}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href={`/train/${alarm.trainNumber}`}
                className="rounded-xl bg-rail-blue/10 px-3 py-2 text-xs font-bold text-rail-blue hover:bg-rail-blue hover:text-white transition-colors"
              >
                Track
              </Link>
              <button
                onClick={() => removeAlarm.mutate(alarm._id)}
                className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-500 hover:text-white transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      </div>
    </RequireAuth>
  );
}
