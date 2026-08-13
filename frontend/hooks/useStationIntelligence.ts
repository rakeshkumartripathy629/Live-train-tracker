'use client';

import { useQuery } from '@tanstack/react-query';
import { StationDetail, StationPerformance, NearbyStationsResponse, RouteIntelligence } from '@/types/station';
import { apiRequest } from '@/lib/api';

export function useStationDetail(stationCode: string) {
  return useQuery({
    queryKey: ['stationDetail', stationCode],
    queryFn: () => apiRequest<StationDetail>(`/stations/${encodeURIComponent(stationCode)}`),
    enabled: Boolean(stationCode),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

export function useStationPerformance(stationCode: string) {
  return useQuery({
    queryKey: ['stationPerformance', stationCode],
    queryFn: () => apiRequest<StationPerformance>(`/stations/${encodeURIComponent(stationCode)}/performance`),
    enabled: Boolean(stationCode),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useStationNearby(stationCode: string) {
  return useQuery({
    queryKey: ['stationNearby', stationCode],
    queryFn: () => apiRequest<NearbyStationsResponse>(`/stations/${encodeURIComponent(stationCode)}/nearby`),
    enabled: Boolean(stationCode),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

export function useRouteIntelligence(trainNumber: string) {
  return useQuery({
    queryKey: ['routeIntelligence', trainNumber],
    queryFn: () => apiRequest<RouteIntelligence>(`/trains/${encodeURIComponent(trainNumber)}/route-intelligence`),
    enabled: Boolean(trainNumber),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
