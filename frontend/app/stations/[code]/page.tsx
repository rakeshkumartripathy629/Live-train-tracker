'use client';

import React from 'react';
import { useStationDetail } from '@/hooks/useStationIntelligence';
import { useStationStream } from '@/hooks/useStationStream';
import { StationPageHeader } from '@/components/station/StationPageHeader';
import { StationLiveBoardCard } from '@/components/station/StationLiveBoardCard';
import { StationLiveActivityCard } from '@/components/station/StationLiveActivityCard';
import { StationPerformanceCard } from '@/components/station/StationPerformanceCard';
import { NearbyStationsCard } from '@/components/station/NearbyStationsCard';
import { StationWeatherCard } from '@/components/station/StationWeatherCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorCard } from '@/components/ui/ErrorCard';

export default function StationPage({ params }: { params: { code: string } }) {
  const code = String(params.code || '').trim().toUpperCase();
  const { data: detail, isLoading, isError, refetch } = useStationDetail(code);
  const stream = useStationStream(code);

  return (
    <div className="space-y-6 py-4 max-w-5xl mx-auto">
      <StationPageHeader detail={detail} isLoading={isLoading} streamState={stream.state} />

      {isError && (
        <ErrorCard
          title="Station not found"
          message={`"${code}" is not a valid station reference, or the station lookup failed. Real references only — no guessed entries.`}
          onRetry={() => refetch()}
        />
      )}

      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="lg:col-span-7 h-96 rounded-3xl" />
          <Skeleton className="lg:col-span-5 h-64 rounded-3xl" />
        </div>
      )}

      {!isError && !isLoading && (
        <>
          <StationLiveActivityCard stationCode={code} />
          <StationLiveBoardCard stationCode={code} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StationPerformanceCard stationCode={code} />
            <NearbyStationsCard stationCode={code} />
          </div>

          <StationWeatherCard detail={detail} />
        </>
      )}
    </div>
  );
}
