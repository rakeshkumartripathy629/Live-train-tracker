export interface Station {
  code: string;
  name: string;
}

export interface BetweenTrain {
  number: string;
  name: string;
  type: string;
  runDays: string[];
  from: { departure: string; day: number; sequence: number };
  to: { arrival: string; day: number; sequence: number };
  distance: number;
  duration: number;
  totalHaltsBetween: number;
  live?: {
    type: string;
    startDate: string;
    expectedArrivalTime: string;
    platform: string;
    delayMinutes: number;
  };
}

export interface BetweenTrainsResponse {
  from: Station;
  to: Station;
  count: number;
  trains: BetweenTrain[];
}

export interface LiveBoardTrain {
  train: {
    number: string;
    name: string;
    type: string;
    source: string;
    destination: string;
    runDays: string[];
  };
  stop: {
    sequence: number;
    arrival: string | null;
    departure: string | null;
    day: number;
    distance: number;
    platform: string;
  };
  live: {
    type: 'at-station' | 'upcoming' | 'departed' | 'scheduled';
    expectedDepartureTime: string;
    platform: string;
    delayMinutes: number;
  };
}

export interface StationLiveBoard {
  station: Station;
  window: { from: string; to: string; hoursBack: number; hoursAhead: number };
  count: number;
  trains: LiveBoardTrain[];
}

export interface RouteStop {
  sequence: number;
  station: Station;
  arrival: string | null;
  departure: string | null;
  arrivalDay: number;
  departureDay: number;
  distance: number;
  isHalt: boolean;
  platform: string;
  speedToNextStationKmph: number;
}

export interface TrainDetails {
  train: {
    number: string;
    name: string;
    type: string;
    category: string;
    source: Station;
    destination: Station;
    runDays: string[];
    distance: number;
    duration: number;
    avgSpeed: number;
    maxSpeed: number;
    totalHalts: number;
    returnTrain: string;
    coachPosition: string;
  };
  route: RouteStop[];
  routeGeometry?: [number, number][];
}

export interface Alarm {
  _id: string;
  deviceId: string;
  trainNumber: string;
  trainName: string;
  stationCode: string;
  stationName: string;
  distanceKm: number;
  mode: 'distance' | 'arrival';
  active: boolean;
  notifiedAt: string | null;
  createdAt: string;
}

// ─── Phase 8: production station + route intelligence ───────────────────

export interface StationDetail {
  code: string;
  name: string;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  verified: boolean;
  source: string;
  lastSeenAt: string | null;
}

export interface StationPerformance {
  available: boolean;
  reason?: string;
  message?: string;
  station?: { code: string; name: string };
  windowDays?: number;
  sampleSize?: number;
  stats?: {
    trainCount: number;
    arrivals: number;
    departures: number;
    atStation: number;
    delay: {
      count: number;
      avgMinutes: number | null;
      minMinutes: number | null;
      maxMinutes: number | null;
    };
    punctualityPercent: number | null;
  };
}

export interface NearbyStationsResponse {
  available: boolean;
  reason?: string;
  message?: string;
  center?: { code: string; name: string };
  radiusKm?: number;
  stations?: { code: string; name: string; distanceKm: number | null; lat: number | null; lng: number | null }[];
}

export type StationStreamEventType =
  | 'STATION_TRAIN_UPDATE'
  | 'STATION_TRAIN_ARRIVED'
  | 'STATION_TRAIN_DEPARTED'
  | 'STATION_TRAIN_AT_STATION'
  | 'STATION_INITIAL_STATE';

export interface StationStreamEvent {
  type: StationStreamEventType;
  trainNumber: string | null;
  trainName: string | null;
  journeyDate: string | null;
  eventType: 'ARRIVED' | 'DEPARTED' | 'AT_STATION' | null;
  station: { code: string; name: string | null };
  status: string | null;
  delayMinutes: number | null;
  platform: string | null;
  observedAt: string | null;
  dataQuality: string | null;
  source: string;
}

export interface RouteSegment {
  from: { code: string | null; name: string | null };
  to: { code: string | null; name: string | null };
  distanceKm: number | null;
  scheduledMinutes: number | null;
  avgSpeedKmph: number | null;
}

export interface RouteStationDelay {
  stationCode: string;
  stationName: string | null;
  sampleSize: number;
  delay: { avgMinutes: number; minMinutes: number | null; maxMinutes: number | null };
}

export interface RouteIntelligence {
  available: boolean;
  reason?: string;
  train?: {
    number: string;
    name: string | null;
    source: string | null;
    destination: string | null;
  };
  totalStops?: number;
  segments?: RouteSegment[];
  stationDelays?: RouteStationDelay[];
  windowDays?: number;
  minDelaySample?: number;
}
