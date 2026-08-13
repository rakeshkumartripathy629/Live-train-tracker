'use client';

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';

export interface RouteStop {
  sequence?: number;
  station?: { code: string; name: string; lat: number; lng: number };
  distance?: number;
  isHalt?: boolean;
  arrival?: string;
  departure?: string;
}

export interface TrainRouteData {
  train?: {
    number: string;
    name?: string;
    source?: { code?: string; name?: string };
    destination?: { code?: string; name?: string };
  };
  route?: RouteStop[];
}

export function useTrainRoute(trainId: string) {
  return useQuery({
    queryKey: ['trainRoute', trainId],
    queryFn: () => apiRequest<TrainRouteData>(`/trains/${trainId}`),
    enabled: Boolean(trainId),
    staleTime: 60 * 60 * 1000,
  });
}
