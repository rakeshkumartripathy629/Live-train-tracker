'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { useJourneyStore } from '@/store/journey';
import type { LiveJourney } from '@/types/train';
import { applyLivePatch, type LiveConnectionState, type StreamPayload } from '@/lib/live-patch';

interface ActiveJourneyDoc {
  id: string;
  trainNumber: string;
  trainName: string;
  status: string;
}

const STREAM_EVENTS = [
  'initial-state',
  'train-update',
  'train-status-changed',
  'train-delay-changed',
  'train-station-changed',
  'train-eta-changed',
  'journey-completed',
  'tracking-stale',
  'tracking-recovered',
  'error',
] as const;

/**
 * Phase 7 — real-time SSE feed for a tracked journey.
 *
 * Opens a same-origin EventSource (Next.js proxy → backend SSE), then patches
 * the live journey in the react-query cache that useLiveJourney reads, so the
 * whole page updates with real worker observations. The browser never talks to
 * the backend or RailRadar directly.
 *
 * The stream only starts for the logged-in owner of an ACTIVE journey on that
 * train and honours the auto-refresh toggle (off = no live updates at all).
 */
export function useLiveJourneyStream(trainNumber: string) {
  const queryClient = useQueryClient();
  const autoRefresh = useJourneyStore((state) => state.autoRefresh);
  const [state, setState] = useState<LiveConnectionState>('DISCONNECTED');
  const [lastObservedAt, setLastObservedAt] = useState<string | null>(null);
  const [dataQuality, setDataQuality] = useState<string | null>(null);

  const { data: activeJourneys, isLoading: isLoadingJourneys } = useQuery({
    queryKey: ['journeys', 'ACTIVE'],
    queryFn: () => apiRequest<ActiveJourneyDoc[]>('/api/journeys?status=ACTIVE'),
    enabled: Boolean(trainNumber) && autoRefresh,
    staleTime: 60 * 1000,
    retry: 1,
  });

  // Canonical train-number comparison (strips leading zeros) so the URL id
  // matches the stored journey number even with formatting differences.
  const norm = (s: string) => String(s || '').trim().replace(/^0+/, '');
  const journey = useMemo(
    () =>
      Array.isArray(activeJourneys)
        ? activeJourneys.find((j) => norm(j.trainNumber) === norm(trainNumber))
        : undefined,
    [activeJourneys, trainNumber]
  );

  // A stream only applies when the logged-in user owns an ACTIVE journey for
  // this train AND auto-refresh is on. The page hides the indicator otherwise,
  // so "Live updates unavailable" never shows when no stream is expected.
  const streamReady = Boolean(journey?.id) && journey?.status === 'ACTIVE' && autoRefresh;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!trainNumber || !journey?.id || !autoRefresh) return;
    if (journey.status !== 'ACTIVE') return;

    setState('CONNECTING');
    const source = new EventSource(`/api/stream/journey/${journey.id}`);
    let closedByUs = false;

    const patch = (payload: StreamPayload) => {
      if (!payload) return;
      if (payload.observedAt) setLastObservedAt(payload.observedAt);
      if (payload.dataQuality) setDataQuality(payload.dataQuality);

      if (payload.type === 'JOURNEY_COMPLETED') {
        queryClient.setQueryData<LiveJourney>(['liveJourney', trainNumber], (old) =>
          old ? { ...old, status: 'completed' as const } : old
        );
        setState('DISCONNECTED');
        closedByUs = true;
        source.close();
        return;
      }

      queryClient.setQueryData<LiveJourney>(['liveJourney', trainNumber], (old) =>
        old ? applyLivePatch(old, payload) : old
      );
    };

    const onMessage = (event: MessageEvent<string>) => {
      try {
        patch(JSON.parse(event.data));
      } catch {
        // malformed frames are ignored; the stream keeps going
      }
    };

    source.onopen = () => setState('CONNECTED');

    for (const name of STREAM_EVENTS) source.addEventListener(name, onMessage);

    source.onerror = () => {
      if (closedByUs) return;
      if (source.readyState === EventSource.CLOSED) {
        setState('DISCONNECTED');
      } else {
        setState((current) =>
          current === 'CONNECTED' ? 'RECONNECTING' : current === 'CONNECTING' ? 'ERROR' : 'RECONNECTING'
        );
      }
    };

    return () => {
      closedByUs = true;
      source.close();
      setState('DISCONNECTED');
    };
  }, [trainNumber, journey?.id, autoRefresh, queryClient]);

  return {
    state,
    isLive: state === 'CONNECTED',
    lastObservedAt,
    dataQuality,
    streamReady,
    isLoadingJourneys,
  };
}
