'use client';

import { useQuery } from '@tanstack/react-query';
import { PnrStatus } from '@/types/pnr';
import { apiRequest } from '@/lib/api';

export function usePnrStatus(pnr: string, enabled = true) {
  return useQuery({
    queryKey: ['pnr', pnr],
    queryFn: () => apiRequest<PnrStatus>(`/pnr/${pnr}`),
    enabled: enabled && /^\d{10}$/.test(pnr),
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}
