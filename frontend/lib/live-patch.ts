import type { LiveJourney, Station } from '@/types/train';

export interface StreamPayload {
  type: string;
  trainNumber?: string | null;
  journeyDate?: string | null;
  trainName?: string | null;
  observedAt?: string | null;
  status?: string | null;
  delayMinutes?: number | null;
  currentStation?: { code?: string; name?: string } | null;
  nextStation?: { code?: string; name?: string } | null;
  previousStationCode?: string | null;
  speedKmh?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  platform?: string | null;
  completionFraction?: number | null;
  dataQuality?: string | null;
  source?: string | null;
}

export type LiveConnectionState =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DISCONNECTED'
  | 'ERROR';

const STATUS_MAP: Record<string, LiveJourney['status'] | null> = {
  NOT_STARTED: 'not_started',
  RUNNING: 'running',
  AT_STATION: 'running',
  DEPARTED: 'running',
  ARRIVED: 'completed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DIVERTED: 'cancelled',
};

export function normalizeLiveStatus(status: string | null | undefined): LiveJourney['status'] | null {
  if (!status) return null;
  const key = String(status).toUpperCase().replace(/-/g, '_');
  return STATUS_MAP[key] ?? null;
}

export function findStation(stations: Station[], code: string | null | undefined): Station | undefined {
  if (!code) return undefined;
  const target = String(code).toUpperCase();
  return stations.find((s) => String(s.code).toUpperCase() === target);
}

export function markStationProgress(stations: Station[], currentCode: string): Station[] {
  const index = stations.findIndex((s) => String(s.code).toUpperCase() === String(currentCode).toUpperCase());
  if (index === -1) return stations;
  return stations.map((station, i) => {
    if (i === index) return { ...station, status: 'current' as const };
    if (i < index) return { ...station, status: 'passed' as const };
    return { ...station, status: 'upcoming' as const };
  });
}

/**
 * Merge a real SSE payload into the current LiveJourney. Every field written
 * comes from the backend snapshot — nothing is fabricated, estimated or copied
 * from station data. Returns the original object when nothing applies.
 */
export function applyLivePatch(journey: LiveJourney, payload: StreamPayload): LiveJourney {
  if (!journey || !payload) return journey;

  let changed = false;
  const next: LiveJourney = {
    ...journey,
    currentLocation: { ...journey.currentLocation },
    stations: journey.stations,
  };

  const mappedStatus = normalizeLiveStatus(payload.status);
  if (mappedStatus && mappedStatus !== journey.status) {
    next.status = mappedStatus;
    changed = true;
  }

  if (typeof payload.delayMinutes === 'number' && payload.delayMinutes !== journey.delayMinutes) {
    next.delayMinutes = payload.delayMinutes;
    changed = true;
  }

  if (typeof payload.speedKmh === 'number' && payload.speedKmh !== journey.speedKmh) {
    next.speedKmh = payload.speedKmh;
    next.currentLocation = { ...next.currentLocation, speedKmh: payload.speedKmh, isMoving: payload.speedKmh > 0 };
    changed = true;
  }

  if (typeof payload.latitude === 'number' && typeof payload.longitude === 'number') {
    next.currentLocation = {
      ...next.currentLocation,
      lat: payload.latitude,
      lng: payload.longitude,
    };
    changed = true;
  }

  if (typeof payload.completionFraction === 'number') {
    const pct = Math.round(payload.completionFraction * 1000) / 10;
    if (pct !== journey.completionPercentage) {
      next.completionPercentage = pct;
      changed = true;
    }
  }

  if (payload.observedAt && payload.observedAt !== journey.lastUpdated) {
    next.lastUpdated = payload.observedAt;
    changed = true;
  }

  if (payload.currentStation?.code) {
    const found = findStation(journey.stations, payload.currentStation.code);
    if (found) {
      next.currentStation = { ...found, status: 'current' as const };
      next.stations = markStationProgress(journey.stations, found.code);
      changed = true;
    }
  }

  if (payload.nextStation?.code) {
    const found = findStation(journey.stations, payload.nextStation.code);
    if (found) {
      next.nextStation = { ...found, status: 'upcoming' as const };
      changed = true;
    }
  }

  return changed ? next : journey;
}
