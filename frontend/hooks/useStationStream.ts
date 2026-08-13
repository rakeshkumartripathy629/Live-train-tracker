'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { StationStreamEvent } from '@/types/station';

const STREAM_EVENTS = [
  'initial-state',
  'station-train-update',
  'station-train-arrived',
  'station-train-departed',
  'station-train-at-station',
] as const;

export type StationConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';

const MAX_EVENTS = 20;

/**
 * Phase 8 — real-time SSE feed for a station's live board.
 *
 * Opens a same-origin EventSource (Next.js proxy → backend station stream).
 * Each frame is a real station observation (arrival / departure / at-station)
 * broadcast by the tracking worker. No data is synthesised client-side.
 */
export function useStationStream(stationCode: string) {
  const [state, setState] = useState<StationConnectionState>('DISCONNECTED');
  const [events, setEvents] = useState<StationStreamEvent[]>([]);
  const eventsRef = useRef<StationStreamEvent[]>([]);

  const push = (payload: StationStreamEvent) => {
    if (!payload || typeof payload !== 'object') return;
    const next = [...eventsRef.current, payload].slice(-MAX_EVENTS);
    eventsRef.current = next;
    setEvents(next);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const code = String(stationCode || '').trim().toUpperCase();
    if (!code) return;

    setState('CONNECTING');
    setEvents([]);
    eventsRef.current = [];
    const source = new EventSource(`/api/stream/station/${code}`);
    let closedByUs = false;

    const onMessage = (event: MessageEvent<string>) => {
      try {
        push(JSON.parse(event.data));
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
  }, [stationCode]);

  // Live arrivals/departures = the most recent real events for each train.
  const liveActivity = useMemo(() => {
    const latestByTrain = new Map<string, StationStreamEvent>();
    for (const e of events) {
      if (!e.trainNumber) continue;
      if (e.type === 'STATION_INITIAL_STATE') continue;
      latestByTrain.set(e.trainNumber, e);
    }
    return [...latestByTrain.values()].reverse();
  }, [events]);

  return {
    state,
    isLive: state === 'CONNECTED',
    events,
    liveActivity,
    lastObservedAt: events.length ? events[events.length - 1].observedAt || null : null,
  };
}
