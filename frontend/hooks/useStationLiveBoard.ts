'use client';

import { useQuery } from '@tanstack/react-query';
import { StationLiveBoard } from '@/types/station';
import { apiRequest } from '@/lib/api';

export function useStationLiveBoard(stationCode: string, hours = 4) {
  return useQuery({
    queryKey: ['stationLive', stationCode, hours],
    queryFn: () => apiRequest<StationLiveBoard>(`/stations/${stationCode}/live?hours=${hours}`),
    enabled: Boolean(stationCode),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    retry: 1,
  });
}
