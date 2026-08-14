'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Luggage,
  CalendarDays,
  MapPin,
  Flag,
  Play,
  Check,
  X,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useLiveJourney } from '@/hooks/useLiveJourney';
import { JourneyDetail, JourneyStatus } from '@/types/journey';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorCard } from '@/components/ui/ErrorCard';
import { Button } from '@/components/ui/Button';
import { TrainAvatar } from '@/components/ui/TrainAvatar';
import { JourneyCard } from '@/components/journey/JourneyCard';
import { Timeline } from '@/components/journey/Timeline';
import { StatusBadge } from '@/components/journey/StatusBadge';
import { JourneyAlerts } from '@/components/alerts/JourneyAlerts';
import { cn } from '@/utils/cn';
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('@/features/maps/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[440px] w-full items-center justify-center rounded-3xl bg-slate-900/30">
      <Skeleton className="h-full w-full rounded-3xl" />
    </div>
  ),
});

function formatISTDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

const JOURNEY_STATUS_CHIP: Record<JourneyStatus, string> = {
  PLANNED: 'bg-slate-500/15 text-slate-600 border-slate-500/30 dark:text-slate-300',
  ACTIVE: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
  COMPLETED: 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-400',
  CANCELLED: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-400',
};

export default function JourneyDetailPage({ params }: { params: { id: string } }) {
  const queryClient = useQueryClient();
  const id = params.id;

  const { data: detail, isLoading, isError, refetch } = useQuery<JourneyDetail>({
    queryKey: ['journey', id],
    queryFn: () => apiClient<JourneyDetail>(`/api/journeys/${id}`),
    enabled: Boolean(id),
    staleTime: 15 * 1000,
  });

  // Reuse the existing live-journey hook: polls every 30s via Redis-cached
  // backend, pauses in background tabs, stops when the journey is not ACTIVE.
  const { data: live, isLoading: liveLoading, refetch: refetchLive, isRefetching } = useLiveJourney(
    detail?.trainNumber || '',
    detail?.status === 'ACTIVE'
  );

  const action = useMutation({
    mutationFn: (act: 'start' | 'complete' | 'cancel') =>
      apiClient(`/api/journeys/${id}/${act}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journey', id] });
      queryClient.invalidateQueries({ queryKey: ['journeys'] });
    },
  });

  if (isLoading) {
    return (
      <RequireAuth>
        <div className="space-y-6 py-4">
          <Skeleton className="h-10 w-40 rounded-xl" />
          <Skeleton className="h-44 w-full rounded-3xl" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Skeleton className="lg:col-span-7 h-[440px] rounded-3xl" />
            <Skeleton className="lg:col-span-5 h-[440px] rounded-3xl" />
          </div>
        </div>
      </RequireAuth>
    );
  }

  if (isError || !detail) {
    return (
      <RequireAuth>
        <div className="py-12 max-w-xl mx-auto space-y-4">
          <Link
            href="/journeys"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-rail-blue transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Journeys
          </Link>
          <ErrorCard
            title="Journey Not Found"
            message="Journey nahi mila, ya aapko is journey tak access nahi hai."
            onRetry={() => refetch()}
          />
        </div>
      </RequireAuth>
    );
  }

  const isActive = detail.status === 'ACTIVE';
  const liveJourney = live;

  return (
    <RequireAuth>
      <div className="space-y-6 py-4">
        {/* Back */}
        <Link
          href="/journeys"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors w-fit"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Journeys
        </Link>

        {/* ─── Journey Information ─── */}
        <div className="glass-panel rounded-3xl p-5 sm:p-6 shadow-glass space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <TrainAvatar number={detail.trainNumber} size="lg" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-rail-blue/10 px-2 py-0.5 font-mono text-xs font-bold text-rail-blue">
                    #{detail.trainNumber}
                  </span>
                  <span
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                      JOURNEY_STATUS_CHIP[detail.status]
                    )}
                  >
                    {detail.status}
                  </span>
                </div>
                <h2 className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white">
                  {detail.trainName}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatISTDate(detail.journeyDate + 'T00:00:00Z')}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/60 dark:bg-slate-900/50">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-rail-blue/10 text-rail-blue">
                <Flag className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Boarding</p>
                <p className="font-bold text-sm text-slate-900 dark:text-white">
                  {detail.boardingStationName} ({detail.boardingStationCode})
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/60 dark:bg-slate-900/50">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Destination</p>
                <p className="font-bold text-sm text-slate-900 dark:text-white">
                  {detail.destinationStationName} ({detail.destinationStationCode})
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/60 dark:bg-slate-900/50">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-400">
                <Luggage className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Train Route</p>
                <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  {detail.origin?.name} → {detail.destination?.name}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            {detail.startedAt && (
              <span>Started: {formatISTDate(detail.startedAt)}</span>
            )}
            {detail.completedAt && <span>· Completed: {formatISTDate(detail.completedAt)}</span>}
            {detail.lastTrackedAt && <span>· Last tracked: {formatISTDate(detail.lastTrackedAt)}</span>}
          </div>
        </div>

        {/* ─── Actions ─── */}
        {(detail.status === 'PLANNED' || detail.status === 'ACTIVE') && (
          <div className="flex flex-wrap items-center gap-3">
            {detail.status === 'PLANNED' && (
              <Button
                onClick={() => action.mutate('start')}
                disabled={action.isPending}
                variant="success"
                size="md"
              >
                {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Start Journey
              </Button>
            )}
            {detail.status === 'ACTIVE' && (
              <Button
                onClick={() => action.mutate('complete')}
                disabled={action.isPending}
                variant="primary"
                size="md"
              >
                {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Complete Journey
              </Button>
            )}
            <Button
              onClick={() => action.mutate('cancel')}
              disabled={action.isPending}
              variant="danger"
              size="md"
            >
              <X className="h-4 w-4" />
              Cancel Journey
            </Button>
          </div>
        )}

        {/* ─── Phase 5 Journey Alerts ─── */}
        <JourneyAlerts
          journeyId={detail.id}
          trainNumber={detail.trainNumber}
          trainName={detail.trainName}
          destinationStationCode={detail.destinationStationCode}
          destinationStationName={detail.destinationStationName}
          status={detail.status}
        />

        {/* ─── Live Information ─── */}
        {isActive ? (
          liveLoading && !liveJourney ? (
            <div className="space-y-6">
              <Skeleton className="h-48 w-full rounded-3xl" />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <Skeleton className="lg:col-span-7 h-[440px] rounded-3xl" />
                <Skeleton className="lg:col-span-5 h-[440px] rounded-3xl" />
              </div>
            </div>
          ) : liveJourney ? (
            <>
              <JourneyCard
                journey={liveJourney}
                onRefresh={() => refetchLive()}
                isRefreshing={isRefetching}
              />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 xl:col-span-8">
                  <MapView journey={liveJourney} className="h-[440px] w-full" />
                </div>
                <div className="lg:col-span-5 xl:col-span-4">
                  <Timeline
                    stations={liveJourney.stations}
                    currentStationCode={liveJourney.currentStation?.code}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-3 rounded-3xl border border-amber-500/25 bg-amber-500/10 p-6">
              <AlertTriangle className="h-6 w-6 text-amber-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                  Live information temporarily unavailable
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  RailRadar se live data nahi mil paya. Journey ki metadata (boarding, destination,
                  date) MongoDB se safe hai. Koi fake position/status nahi dikhaya ja raha.
                </p>
                <button
                  onClick={() => refetchLive()}
                  className="mt-3 rounded-xl bg-amber-600/20 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-600/30 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="glass-panel rounded-3xl p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <StatusBadge
                status={detail.status === 'COMPLETED' ? 'completed' : detail.status === 'CANCELLED' ? 'cancelled' : 'not_started'}
              />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {detail.status === 'PLANNED'
                  ? 'Journey abhi start nahi hui. Train chalne par "Start Journey" dabao — live tracking shuru ho jayega.'
                  : detail.status === 'COMPLETED'
                  ? 'Journey complete ho chuki hai. Ye history record me safe hai.'
                  : 'Journey cancel kar di gayi hai. Historical record rakha gaya hai.'}
              </p>
            </div>
            {detail.status === 'PLANNED' && (
              <Link href={`/train/${detail.trainNumber}`} className="mt-4 inline-flex items-center gap-2">
                <Button variant="primary" size="md">
                  <MapPin className="h-4 w-4" /> View Live Train
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
