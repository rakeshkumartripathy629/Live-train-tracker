'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  Train,
  ArrowRight,
  MapPin,
  RefreshCw,
  AlertTriangle,
  Radio,
} from 'lucide-react';
import { useAuthFavorites } from '@/hooks/useAuthFavorites';
import { apiClient } from '@/lib/api-client';
import { FavoriteRecord } from '@/types/journey';
import { LiveJourney } from '@/types/train';
import { FavoriteButton } from '@/features/favorites/FavoriteButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { StatusBadge, TrainLiveStatus } from '@/components/journey/StatusBadge';
import { DelayBadge } from '@/components/journey/DelayBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatTimeAgo } from '@/utils/format';
import { cn } from '@/utils/cn';

type LiveMap = Record<string, LiveJourney | { error: string }>;

function liveStatusFor(entry: LiveJourney | { error: string } | undefined): TrainLiveStatus {
  if (!entry || 'error' in entry) return 'unavailable';
  return entry.status;
}

function FavoriteLiveCard({ favorite, live, index }: { favorite: FavoriteRecord; live?: LiveJourney | { error: string }; index: number }) {
  const hasLive = live && !('error' in live) && (live as LiveJourney).number;
  const journey = hasLive ? (live as LiveJourney) : null;
  const status = liveStatusFor(live);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -10 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
    >
      <Link
        href={`/train/${favorite.trainNumber}`}
        className="glass-panel group relative flex flex-col rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glass-hover"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-rail-blue/10 text-rail-blue group-hover:bg-rail-blue group-hover:text-white transition-colors">
              <Train className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="font-mono text-[11px] font-bold text-rail-blue block">
                #{favorite.trainNumber}
              </span>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate">
                {favorite.trainName}
              </h3>
              <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                <span className="truncate">{favorite.origin?.name}</span>
                <ArrowRight className="h-2.5 w-2.5 flex-shrink-0" />
                <span className="truncate">{favorite.destination?.name}</span>
              </div>
            </div>
          </div>
          <FavoriteButton
            train={{
              id: favorite.trainNumber,
              number: favorite.trainNumber,
              name: favorite.trainName,
              origin: favorite.origin,
              destination: favorite.destination,
            }}
            size="sm"
            className="flex-shrink-0"
          />
        </div>

        {/* Live section */}
        <div className="mt-4 space-y-2.5">
          {!live ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-9 w-full rounded-xl" />
            </div>
          ) : status === 'unavailable' ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                  Live information temporarily unavailable
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  RailRadar se live data mil nahi paya — koi fake status nahi dikhaya ja raha.
                </p>
              </div>
            </div>
          ) : journey ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={status} />
                <DelayBadge delayMinutes={journey.delayMinutes} />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/50">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Current / Last Station
                  </p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {journey.currentStation?.name || journey.previousStation?.name || 'In Transit'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/50">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Next Station
                  </p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {journey.nextStation?.name || '—'}
                  </p>
                  {journey.nextStation && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Arr {journey.nextStation.scheduledArrival || '--:--'}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1 min-w-0">
                  <Radio className="h-3 w-3 text-rail-blue flex-shrink-0" />
                  <span className="truncate">{journey.ETA}</span>
                </span>
                <span className="flex-shrink-0">
                  Updated {formatTimeAgo(journey.lastUpdated)}
                </span>
              </div>
            </>
          ) : null}
        </div>
      </Link>
    </motion.div>
  );
}

export default function FavoritesPage() {
  const { isUser, favorites, pending } = useAuthFavorites();

  const numbersKey = favorites
    .map((f) => f.trainNumber)
    .sort()
    .join(',');

  const { data: liveMap, isLoading: liveLoading, refetch, isRefetching } = useQuery<LiveMap>({
    queryKey: ['favoritesLive', isUser, numbersKey],
    queryFn: () =>
      apiClient<LiveMap>('/api/favorites/live', {
        method: 'POST',
        body: { trainNumbers: favorites.map((f) => f.trainNumber) },
      }),
    enabled: isUser && favorites.length > 0,
    refetchInterval: isUser && favorites.length > 0 ? 60 * 1000 : false,
    staleTime: 30 * 1000,
  });

  return (
    <RequireAuth>
      <div className="space-y-8 py-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
              <Heart className="h-6 w-6 fill-current" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">My Favorites</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {favorites.length} saved train{favorites.length !== 1 ? 's' : ''} · live status from RailRadar
              </p>
            </div>
          </div>
          {favorites.length > 0 && (
            <button
              onClick={() => refetch()}
              disabled={liveLoading || isRefetching}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', (liveLoading || isRefetching) && 'animate-spin')} />
              Refresh
            </button>
          )}
        </div>

        {/* Favorites Grid */}
        {favorites.length === 0 && !pending ? (
          <EmptyState
            title="No favorites yet"
            description="Heart any train from the live tracking page to save it here for quick access."
            action={
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-4 py-2 text-xs font-semibold text-white shadow-glow hover:bg-sky-600 transition-colors"
              >
                <MapPin className="h-4 w-4" />
                Search Trains
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {favorites.map((train, idx) => (
                <FavoriteLiveCard
                  key={train.trainNumber}
                  favorite={train}
                  live={liveMap?.[train.trainNumber]}
                  index={idx}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        <p className="text-xs text-slate-400">
          Live status har 60 second me refresh hota hai (Redis cache se, RailRadar quota mehfooz rakhte hue).
        </p>
      </div>
    </RequireAuth>
  );
}
