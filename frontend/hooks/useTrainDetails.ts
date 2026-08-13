'use client';

import { useQuery } from '@tanstack/react-query';
import { TrainDetails } from '@/types/station';
import { apiRequest } from '@/lib/api';

export function useTrainDetails(trainNumber: string) {
  return useQuery({
    queryKey: ['trainDetails', trainNumber],
    queryFn: () => apiRequest<TrainDetails>(`/trains/${trainNumber}`),
    enabled: Boolean(trainNumber),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}
