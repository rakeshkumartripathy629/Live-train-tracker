'use client';

import { useQuery } from '@tanstack/react-query';
import { LiveJourney } from '@/types/train';
import { apiRequest } from '@/lib/api';
import { useJourneyStore } from '@/store/journey';

export function useLiveJourney(trainId: string, enabled: boolean = true, pollEnabled: boolean = true) {
  const autoRefresh = useJourneyStore((state) => state.autoRefresh);
  const isActive = Boolean(trainId) && enabled;

  return useQuery({
    queryKey: ['liveJourney', trainId],
    queryFn: () => apiRequest<LiveJourney>(`/trains/${trainId}/live`),
    enabled: isActive,
    refetchInterval: autoRefresh && isActive && pollEnabled ? 30 * 1000 : false,
    refetchIntervalInBackground: false,
    staleTime: 10 * 1000,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });
}
