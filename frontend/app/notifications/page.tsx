'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCheck,
  BellRing,
  Loader2,
  Smartphone,
  Inbox,
  ArrowLeft,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { Skeleton } from '@/components/ui/Skeleton';
import { EVENT_LABELS, NotificationItem } from '@/lib/alerts';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/utils/cn';

interface PrefsData {
  push: {
    configured: boolean;
    enabled: boolean;
    devices: {
      id: string;
      device: string;
      active: boolean;
      deactivatedReason: string | null;
      lastUsedAt: string | null;
    }[];
  };
  channels: string[];
}

const STATUS_STYLE: Record<string, string> = {
  SENT: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  QUEUED: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  SENDING: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  FAILED: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  SKIPPED: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
};

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { items, isLoading, markRead, markAllRead } = useNotifications(25);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  const { data: prefs, isLoading: prefsLoading } = useQuery<PrefsData>({
    queryKey: ['notif-prefs'],
    queryFn: () => apiClient<PrefsData>('/api/notifications/preferences'),
    staleTime: 30 * 1000,
  });

  const disablePush = useMutation({
    mutationFn: () =>
      apiClient('/api/notifications/preferences', { method: 'POST', body: { enabled: false } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notif-prefs'] });
      setPrefsError(null);
    },
    onError: (e: any) => setPrefsError(e?.message || 'Push disable nahi hua'),
  });

  return (
    <RequireAuth>
      <div className="mx-auto max-w-3xl space-y-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/journeys"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors w-fit"
          >
            <ArrowLeft className="h-4 w-4" /> Journeys
          </Link>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
            <Bell className="h-5 w-5 text-rail-blue" /> Notifications
          </h1>
        </div>

        {/* ─── Preferences / push devices ─── */}
        <div className="glass-panel rounded-3xl p-6 shadow-glass space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <BellRing className="h-4 w-4 text-rail-blue" /> Push Notifications
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {prefsLoading
                  ? 'Checking devices…'
                  : prefs?.push.enabled
                  ? `${prefs.push.devices.length} device(s) registered — backend inhi ko bhejega.`
                  : 'Koi active push device nahi. "Enable Alerts" se subscribe karo.'}
              </p>
            </div>
            {prefs?.push.enabled && (
              <button
                onClick={() => disablePush.mutate()}
                disabled={disablePush.isPending}
                className="rounded-xl border border-rose-500/40 px-3 py-2 text-[11px] font-bold text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-60"
              >
                {disablePush.isPending ? 'Disabling…' : 'Disable Push'}
              </button>
            )}
          </div>

          {prefs && prefs.push.devices.length > 0 && (
            <ul className="space-y-2">
              {prefs.push.devices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {d.device}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {d.active ? 'Active' : d.deactivatedReason || 'Inactive'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold',
                      d.active ? 'bg-emerald-500/15 text-emerald-700' : 'bg-slate-200 text-slate-500'
                    )}
                  >
                    {d.active ? 'ON' : 'OFF'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {prefsError && <p className="text-[11px] font-semibold text-rose-500">{prefsError}</p>}
        </div>

        {/* ─── Notification history ─── */}
        <div className="glass-panel rounded-3xl p-6 shadow-glass space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">History</h2>
            {items.some((n) => !n.readAt) && (
              <button
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200/60 dark:bg-slate-800/60 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-2xl" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
              <Inbox className="h-8 w-8" />
              <p className="text-xs">Abhi koi notification nahi.</p>
              <p className="text-[11px] text-center max-w-sm">
                Journey detail page se alerts banao — jab real RailRadar data event trigger karega,
                notification yahan dikhegi.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((n) => (
                <li
                  key={n.id}
                  onClick={() => !n.readAt && markRead.mutate(n.id)}
                  className={cn(
                    'flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors',
                    n.readAt
                      ? 'border-slate-200/70 bg-slate-50/40 dark:border-slate-800/60 dark:bg-slate-900/30'
                      : 'border-rail-blue/25 bg-rail-blue/5 cursor-pointer hover:bg-rail-blue/10'
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {EVENT_LABELS[n.eventType]?.icon || '🔔'}{' '}
                      {EVENT_LABELS[n.eventType]?.label || n.eventType}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{n.message}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                      <span>{formatTime(n.createdAt)}</span>
                      {n.trainNumber && (
                        <Link
                          href={`/train/${n.trainNumber}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono font-bold text-rail-blue hover:underline"
                        >
                          #{n.trainNumber}
                        </Link>
                      )}
                      {n.journeyId && (
                        <Link
                          href={`/journeys/${n.journeyId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold hover:underline"
                        >
                          Journey →
                        </Link>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide flex-shrink-0',
                      STATUS_STYLE[n.status] || 'bg-slate-200 text-slate-500'
                    )}
                  >
                    {n.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-center text-[10px] text-slate-400">
          Notifications real backend train observations se generate hoti hain. {isLoading ? '' : `${items.length} shown`}
        </p>
      </div>
    </RequireAuth>
  );
}
