'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useUserId } from '@/lib/user';
import { useFavoritesStore } from '@/store/favorites';
import { FavoriteRecord } from '@/types/journey';
import type { SearchResult } from '@/types/train';

/**
 * Authenticated favorites backed by MongoDB via /api/favorites.
 * The zustand store is only an optimistic cache — the server is the truth.
 */
export function useAuthFavorites() {
  const userId = useUserId();
  const isUser = Boolean(userId);
  const queryClient = useQueryClient();

  const { data: favorites = [] } = useQuery<FavoriteRecord[]>({
    queryKey: ['authFavorites', userId],
    queryFn: () => apiClient<FavoriteRecord[]>('/api/favorites'),
    enabled: isUser,
    staleTime: 30 * 1000,
  });

  // Hydrate the optimistic store whenever the server truth arrives.
  useEffect(() => {
    if (!isUser || favorites.length === 0) return;
    useFavoritesStore.getState().setFavorites(favorites);
  }, [favorites, isUser]);

  const addMutation = useMutation({
    mutationFn: (trainNumber: string) =>
      apiClient<{ isFavorite: boolean }>('/api/favorites', {
        method: 'POST',
        body: { trainNumber },
      }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['authFavorites', userId] }),
  });

  const removeMutation = useMutation({
    mutationFn: (trainNumber: string) =>
      apiClient<{ deleted: boolean }>(`/api/favorites/${encodeURIComponent(trainNumber)}`, {
        method: 'DELETE',
      }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['authFavorites', userId] }),
  });

  const pending = addMutation.isPending || removeMutation.isPending;
  const lastError = addMutation.error || removeMutation.error;

  const toggle = (train: SearchResult) => {
    if (!isUser || pending) return;
    const store = useFavoritesStore.getState();
    const trainId = train.id || train.number;
    const isFav = store.isFavorite(trainId);

    if (isFav) {
      store.removeFavorite(trainId);
      removeMutation.mutate(train.number);
    } else {
      store.addFavorite(train);
      addMutation.mutate(train.number);
    }
  };

  const isFavorite = (trainNumber: string) =>
    useFavoritesStore.getState().isFavorite(trainNumber) ||
    favorites.some((f) => f.trainNumber === trainNumber);

  return {
    isUser,
    favorites,
    isFavorite,
    toggle,
    pending,
    error: lastError,
  };
}
