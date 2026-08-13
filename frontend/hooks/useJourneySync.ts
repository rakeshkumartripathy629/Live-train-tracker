'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { useDeviceId, useUserId } from '@/lib/user';
import { useSearchStore } from '@/store/search';
import type { SearchResult } from '@/types/train';

interface FetchedRecent {
  label?: string;
  query: string;
  extra?: {
    origin?: { code: string; name: string };
    destination?: { code: string; name: string };
  };
}

export function useJourneySync() {
  const userId = useUserId();
  const deviceId = useDeviceId();
  const isUser = Boolean(userId);
  const queryClient = useQueryClient();

  const { data: fetched } = useQuery({
    queryKey: ['recent', deviceId],
    queryFn: () =>
      apiRequest<FetchedRecent[]>(`/user/recent?deviceId=${deviceId}`),
    enabled: isUser,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!fetched || !isUser) return;
    const store = useSearchStore.getState();
    for (const item of fetched) {
      if (!item.query) continue;
      const train: SearchResult = {
        id: item.query,
        number: item.query,
        name: item.label || item.query,
        origin: item.extra?.origin ?? { code: '', name: '' },
        destination: item.extra?.destination ?? { code: '', name: '' },
      };
      store.addRecentSearch(train);
    }
  }, [fetched, isUser]);

  const save = useMutation({
    mutationFn: (train: SearchResult) =>
      apiRequest('/user/recent', {
        method: 'POST',
        body: {
          deviceId,
          type: 'train',
          query: train.number,
          label: train.name,
          extra: { origin: train.origin, destination: train.destination },
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recent', deviceId] }),
  });

  const recordJourney = (train: SearchResult) => {
    if (isUser) save.mutate(train);
  };

  return { recordJourney };
}
