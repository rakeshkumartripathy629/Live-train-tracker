'use client';

import { useQuery } from '@tanstack/react-query';
import { BetweenTrainsResponse } from '@/types/station';
import { apiRequest } from '@/lib/api';

export function useBetweenStations(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['between', from, to],
    queryFn: () => apiRequest<BetweenTrainsResponse>(`/trains/between/${from}/${to}`),
    enabled: enabled && Boolean(from) && Boolean(to),
    staleTime: 15 * 1000,
    refetchInterval: 60 * 1000,
    retry: 1,
  });
}
