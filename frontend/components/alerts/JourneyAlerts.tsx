'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellRing,
  Plus,
  Trash2,
  Loader2,
  Info,
  X,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { AlertDoc, ALERT_TYPES, alertLabel } from '@/lib/alerts';
import { PushToggle } from '@/components/alarm/PushToggle';
import { cn } from '@/utils/cn';

interface JourneyAlertsProps {
  journeyId: string;
  trainNumber: string;
  trainName: string;
  destinationStationCode: string;
  destinationStationName: string;
  status: string;
}

const DEFAULT_THRESHOLD: Record<string, string> = {
  DELAY_THRESHOLD: '30',
  DELAY_INCREASE: '10',
  DELAY_REDUCTION: '10',
  DESTINATION_APPROACHING: '10',
};

const TYPE_HELP: Record<string, string> = {
  DELAY_THRESHOLD: 'Tab notification milega jab delay is minutes se cross kare.',
  DELAY_INCREASE: 'Delay me minimum is number of minutes ka increment ho.',
  DELAY_REDUCTION: 'Delay me minimum is number of minutes ki kami ho.',
  DESTINATION_APPROACHING: 'Train destination se is kms ke andar pahunche par notify karo.',
  TRAIN_STARTED: 'Jab train apni journey start kare.',
  TRAIN_DEPARTED: 'Jab train current station se chale.',
  TRAIN_ARRIVED: 'Jab train kisi station par pahunche.',
  JOURNEY_COMPLETED: 'Jab journey complete ho.',
  TRAIN_CANCELLED: 'Agar train cancel ho.',
  TRAIN_DIVERTED: 'Agar train route divert ho.',
  LIVE_DATA_STALE: 'Agar live data 30 min+ stale ho.',
};

export function JourneyAlerts({
  journeyId,
  trainNumber,
  trainName,
  destinationStationCode,
  destinationStationName,
  status,
}: JourneyAlertsProps) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [alertType, setAlertType] = useState<string>('DELAY_THRESHOLD');
  const [threshold, setThreshold] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const { data: alerts = [], isLoading } = useQuery<AlertDoc[]>({
    queryKey: ['alerts', journeyId],
    queryFn: () => apiClient<AlertDoc[]>(`/api/alerts?journeyId=${journeyId}`),
    enabled: Boolean(journeyId),
    staleTime: 15 * 1000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['alerts', journeyId] });
  };

  const createAlert = useMutation({
    mutationFn: () => {
      const needsThreshold =
        alertType === 'DELAY_THRESHOLD' || alertType === 'DESTINATION_APPROACHING';
      const value =
        threshold === '' ? null : Math.max(1, Math.min(1440, Number(threshold)));
      return apiClient<{ id: string }>('/api/alerts', {
        method: 'POST',
        body: {
          journeyId,
          alertType,
          ...(needsThreshold && value !== null ? { threshold: value } : {}),
        },
      });
    },
    onSuccess: () => {
      invalidate();
      setAdding(false);
      setThreshold('');
      setError(null);
    },
    onError: (e: any) => {
      setError(e?.message || 'Alert create nahi hua');
    },
  });

  const toggleAlert = useMutation({
    mutationFn: (alert: AlertDoc) =>
      apiClient<AlertDoc>(`/api/alerts/${alert.id}`, {
        method: 'PATCH',
        body: { enabled: !alert.enabled },
      }),
    onSuccess: invalidate,
  });

  const deleteAlert = useMutation({
    mutationFn: (id: string) => apiClient(`/api/alerts/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const needsThreshold =
    alertType === 'DELAY_THRESHOLD' ||
    alertType === 'DESTINATION_APPROACHING' ||
    alertType === 'DELAY_INCREASE' ||
    alertType === 'DELAY_REDUCTION';

  const selected = DEFAULT_THRESHOLD[alertType];

  return (
    <div className="glass-panel rounded-3xl p-6 shadow-glass space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Bell className="h-4 w-4 text-rail-blue" /> Journey Alerts
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Real RailRadar observations se hi triggers hote hain — koi fake data nahi.
          </p>
        </div>
        <PushToggle />
      </div>

      {status === 'CANCELLED' && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
          <Info className="h-4 w-4 flex-shrink-0" /> Cancelled journey ke liye naye alerts nahi
          bana sakte.
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading alerts…
        </div>
      ) : alerts.length === 0 && !adding ? (
        <p className="text-xs text-slate-400 py-2">
          Abhi koi alert nahi. {destinationStationName} par pahunchne, delay, cancellation waghera
          ke liye niche se add karo.
        </p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  {alertLabel(alert.alertType)}
                  {alert.threshold !== null && (
                    <span className="ml-1 font-mono text-rail-blue">
                      ({alert.threshold}
                      {alert.alertType === 'DESTINATION_APPROACHING' ? ' km' : ' min'})
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {alert.enabled ? `Triggered ${alert.triggerCount}×` : 'Disabled'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => toggleAlert.mutate(alert)}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors',
                    alert.enabled
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : 'bg-slate-200/70 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  )}
                  title={alert.enabled ? 'Disable' : 'Enable'}
                >
                  {alert.enabled ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => deleteAlert.mutate(alert.id)}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                  title="Delete alert"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="space-y-3 rounded-2xl border border-rail-blue/30 bg-rail-blue/5 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-900 dark:text-white">New Alert</p>
            <button
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <select
            value={alertType}
            onChange={(e) => {
              setAlertType(e.target.value);
              setThreshold('');
              setError(null);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-rail-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {ALERT_TYPES.map((t) => (
              <option key={t} value={t}>
                {alertLabel(t)}
              </option>
            ))}
          </select>

          {needsThreshold && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={alertType === 'DESTINATION_APPROACHING' ? 1 : 0}
                max={1440}
                value={threshold}
                placeholder={selected}
                onChange={(e) => {
                  setThreshold(e.target.value);
                  setError(null);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-rail-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
              <span className="shrink-0 text-[11px] font-semibold text-slate-400">
                {alertType === 'DESTINATION_APPROACHING' ? 'km' : 'min'}
              </span>
            </div>
          )}

          {TYPE_HELP[alertType] && (
            <p className="flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              {TYPE_HELP[alertType]}
            </p>
          )}

          {error && <p className="text-[11px] font-semibold text-rose-500">{error}</p>}

          <button
            onClick={() => createAlert.mutate()}
            disabled={createAlert.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-4 py-2 text-xs font-bold text-white shadow-glow hover:bg-sky-600 transition-colors disabled:opacity-60"
          >
            {createAlert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
            Save Alert
          </button>
        </div>
      ) : (
        status !== 'CANCELLED' && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-200/60 px-4 py-2 text-xs font-bold text-slate-700 dark:bg-slate-800/60 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Alert
          </button>
        )
      )}

      <p className="text-[10px] leading-relaxed text-slate-400">
        Train {trainNumber} ({trainName}) — destination {destinationStationName} (
        {destinationStationCode}). Delivery sirf real-time RailRadar snapshots aur aapke push
        subscription par depend karti hai.
      </p>
    </div>
  );
}
