'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alarm } from '@/types/station';
import { apiRequest } from '@/lib/api';
import { useDeviceId } from '@/lib/user';

export function useAlarms() {
  const queryClient = useQueryClient();
  const deviceId = useDeviceId();

  const { data: alarms, isLoading, refetch } = useQuery({
    queryKey: ['alarms', deviceId],
    queryFn: () => apiRequest<Alarm[]>(`/alarms?deviceId=${deviceId}`),
    enabled: Boolean(deviceId),
    staleTime: 30 * 1000,
  });

  const createAlarm = useMutation({
    mutationFn: (input: {
      trainNumber: string;
      trainName: string;
      stationCode: string;
      stationName: string;
      distanceKm: number;
      mode: 'distance' | 'arrival';
      pushSubscription?: PushSubscription | null;
    }) =>
      apiRequest<Alarm>(`/alarms`, {
        method: 'POST',
        body: {
          deviceId,
          ...input,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alarms', deviceId] }),
  });

  const removeAlarm = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ deleted: boolean }>(`/alarms/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alarms', deviceId] }),
  });

  return { alarms: alarms || [], isLoading, refetch, createAlarm, removeAlarm };
}
