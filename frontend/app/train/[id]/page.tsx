'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Share2, Check, MapPin, CloudSun, Mountain, AlertCircle, CalendarDays, Luggage } from 'lucide-react';
import { useLiveJourney } from '@/hooks/useLiveJourney';
import { useLiveJourneyStream } from '@/hooks/useLiveJourneyStream';
import { JourneyCard } from '@/components/journey/JourneyCard';
import { Timeline } from '@/components/journey/Timeline';
import { LiveConnectionIndicator } from '@/components/journey/LiveConnectionIndicator';
import { StatusBadge, TrainLiveStatus } from '@/components/journey/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorCard } from '@/components/ui/ErrorCard';
import { WeatherPanel } from '@/features/weather/WeatherPanel';
import { AnalyticsDashboard } from '@/features/analytics/AnalyticsDashboard';
import { TerrainPanel } from '@/features/terrain/TerrainPanel';
import { MobileJourneySummary } from '@/components/layout/MobileJourneySummary';
import { FavoriteButton } from '@/features/favorites/FavoriteButton';
import { AlarmButton } from '@/components/alarm/AlarmButton';
import { SchedulePanel } from '@/features/schedule/SchedulePanel';
import { RouteIntelligencePanel } from '@/features/route/RouteIntelligencePanel';
import { JourneyCreateModal } from '@/components/journey/JourneyCreateModal';
import { cn } from '@/utils/cn';
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('@/features/maps/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[480px] w-full items-center justify-center rounded-3xl bg-slate-900/30">
      <Skeleton className="h-full w-full rounded-3xl" />
    </div>
  ),
});

const TABS = [
  { id: 'map', label: 'Live Map', icon: MapPin },
  { id: 'schedule', label: 'Schedule & Coach', icon: CalendarDays },
  { id: 'weather', label: 'Weather', icon: CloudSun },
  { id: 'analytics', label: 'Terrain & Analytics', icon: Mountain },
] as const;

type TabId = typeof TABS[number]['id'];

export default function TrainJourneyPage({ params }: { params: { id: string } }) {
  const trainId = params.id;
  const stream = useLiveJourneyStream(trainId);
  const { data: journey, isLoading, isError, error, refetch, isRefetching } = useLiveJourney(trainId, true, !stream.isLive);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('map');
  const [trackOpen, setTrackOpen] = useState(false);

  const handleShare = () => {
    if (typeof window === 'undefined') return;
    const shareUrl = window.location.href;
    if (typeof navigator.share === 'function') {
      navigator
        .share({ title: `RailGaadi – ${journey?.name || `Train #${trainId}`}`, url: shareUrl })
        .catch(() => {
          navigator.clipboard.writeText(shareUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
    } else {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-rail-blue/10 px-2.5 py-1 font-mono text-xs font-bold text-rail-blue">
              Train #{trainId}
            </span>
            <Skeleton className="h-8 w-24 rounded-xl" />
          </div>
        </div>
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-12 w-80 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="lg:col-span-7 h-[480px] rounded-3xl" />
          <Skeleton className="lg:col-span-5 h-[480px] rounded-3xl" />
        </div>
      </div>
    );
  }

  if (isError || !journey) {
    const errMsg = (error as Error)?.message || '';
    const isQuotaError = errMsg.includes('QUOTA_EXCEEDED') || errMsg.includes('TOO_MANY_REQUESTS') || errMsg.includes('Daily quota');
    const is404 = errMsg.includes('404') || errMsg.includes('not found');

    return (
      <div className="py-12 max-w-xl mx-auto space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-rail-blue transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Search
        </Link>

        {isQuotaError ? (
          <div className="glass-panel rounded-3xl p-8 text-center space-y-4 border border-amber-500/20">
            <div className="text-4xl">⏳</div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">API Quota Reached</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              The RailRadar free tier allows <strong>50 requests/day</strong>. Today&apos;s quota has been exhausted.
              Live tracking will resume tomorrow, or you can upgrade your RailRadar plan.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <a
                href="https://railradar.in/developers"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-4 py-2 text-xs font-semibold text-white shadow-glow hover:bg-sky-600 transition-colors"
              >
                Upgrade API Plan
              </a>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Back to Search
              </Link>
            </div>
          </div>
        ) : (
          <ErrorCard
            title={is404 ? 'Train Not Found' : 'Live Data Unavailable'}
            message={
              is404
                ? `Train #${trainId} not found. Please check the train number.`
                : `Could not load live data for train #${trainId}. The train may not be running today or the service is temporarily unavailable.`
            }
            onRetry={() => refetch()}
          />
        )}
      </div>
    );
  }

  const status = journey.status as TrainLiveStatus;

  // Build a lean SearchResult-compatible object for FavoriteButton
  const trainForFavorite = {
    id: journey.trainId,
    number: journey.number,
    name: journey.name,
    origin: journey.origin,
    destination: journey.destination,
  };

  return (
    <div className="space-y-4 py-2">
      {/* ─── Top Bar ─── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="flex items-center gap-2">
          {/* Track journey */}
          <button
            onClick={() => setTrackOpen(true)}
            title="Track this train on your journey"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-rail-blue hover:text-white hover:border-rail-blue dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"
          >
            <Luggage className="h-4 w-4" />
            <span className="hidden sm:inline">Track Journey</span>
          </button>

          {/* Status badge */}
          <StatusBadge status={status} />

          {/* Real-time stream indicator (Phase 7) — only when the logged-in user
              owns an ACTIVE journey for this train, else hidden (polling covers it) */}
          {stream.streamReady && (
            <LiveConnectionIndicator state={stream.state} lastObservedAt={stream.lastObservedAt || journey.lastUpdated} />
          )}
          {/* Favorite */}
          <FavoriteButton train={trainForFavorite} />

          {/* Alarm */}
          {journey.status === 'running' && <AlarmButton journey={journey} />}

          {/* Share */}
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-3.5 py-2 text-xs font-semibold text-white shadow-glow transition-all hover:bg-sky-600 active:scale-95"
          >
            {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Share'}</span>
          </button>
        </div>
      </div>

      {/* ─── Mobile Journey Summary ─── */}
      <MobileJourneySummary journey={journey} />

      {/* ─── Hero Journey Card (desktop) ─── */}
      <div className="hidden md:block">
        <JourneyCard journey={journey} onRefresh={() => refetch()} isRefreshing={isRefetching} />
      </div>

      {/* ─── Not-Started / Cancelled Banner ─── */}
      {(journey.status === 'not_started' || journey.status === 'cancelled') && (
        <div className="glass-panel flex items-center gap-3 rounded-2xl p-4 border border-amber-500/20">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {journey.status === 'not_started'
              ? `Train #${journey.number} hasn't departed yet. Live tracking activates once the journey begins (scheduled departure: ${journey.stations[0]?.scheduledDeparture || 'check timetable'}).`
              : `Train #${journey.number} has been cancelled. Please check NTES for alternate arrangements.`}
          </p>
        </div>
      )}

      {/* ─── Tab Selector ─── */}
      <div className="flex items-center gap-1.5 rounded-2xl glass-panel p-1.5 shadow-glass w-full md:w-fit overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 whitespace-nowrap flex-shrink-0',
              activeTab === id
                ? 'bg-rail-blue text-white shadow-glow'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ─── Main Content ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Active feature panel */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {activeTab === 'map' && <MapView journey={journey} className="h-[480px] w-full" />}
          {activeTab === 'schedule' && (
            <>
              <SchedulePanel trainId={journey.trainId} />
              <RouteIntelligencePanel trainId={journey.trainId} />
            </>
          )}
          {activeTab === 'weather' && <WeatherPanel journey={journey} />}
          {activeTab === 'analytics' && (
            <>
              <AnalyticsDashboard journey={journey} />
              <TerrainPanel trainId={journey.trainId} />
            </>
          )}
        </div>

        {/* Route Timeline */}
        <div className="lg:col-span-5 xl:col-span-4">
          <Timeline
            stations={journey.stations}
            currentStationCode={journey.currentStation?.code}
          />
        </div>
      </div>

      {/* Track Journey Modal */}
      <JourneyCreateModal
        trainId={trainId}
        trainName={journey.name}
        open={trackOpen}
        onClose={() => setTrackOpen(false)}
      />
    </div>
  );
}
