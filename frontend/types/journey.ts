import { LiveJourney } from '@/types/train';

export type JourneyStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface StationRef {
  code: string;
  name: string;
}

export interface Journey {
  id: string;
  trainNumber: string;
  trainName: string;
  origin: StationRef;
  destination: StationRef;
  boardingStationCode: string;
  boardingStationName: string;
  destinationStationCode: string;
  destinationStationName: string;
  journeyDate: string;
  status: JourneyStatus;
  startedAt: string | null;
  completedAt: string | null;
  lastTrackedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JourneyDetail extends Journey {
  journeyProgress: number | null;
  live: {
    available: boolean;
    data?: LiveJourney;
    error?: string;
  };
}

export interface FavoriteRecord {
  trainNumber: string;
  trainName: string;
  origin: StationRef;
  destination: StationRef;
  createdAt: string | null;
}
