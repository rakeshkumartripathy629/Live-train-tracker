'use client';

import { useQuery } from '@tanstack/react-query';
import { Station } from '@/types/station';
import { apiRequest } from '@/lib/api';

export function useStationSearch(query: string) {
  return useQuery({
    queryKey: ['stationSearch', query],
    queryFn: () => apiRequest<Station[]>(`/stations/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length >= 1,
    staleTime: 60 * 60 * 1000,
  });
}
