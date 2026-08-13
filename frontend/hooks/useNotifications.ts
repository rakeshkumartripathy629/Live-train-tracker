'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NotificationItem } from '@/lib/alerts';
import { apiClient } from '@/lib/api-client';

export interface NotificationsPage {
  items: NotificationItem[];
  nextCursor: string | null;
}

export function useNotifications(limit = 20, enabled = true) {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery<NotificationsPage>({
    queryKey: ['notifications', limit],
    queryFn: () => apiClient<NotificationsPage>(`/api/notifications?limit=${limit}`),
    enabled,
    staleTime: 20 * 1000,
    refetchInterval: 45 * 1000,
  });

  const items = enabled ? data?.items || [] : [];
  const unreadCount = items.filter((n) => !n.readAt).length;

  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiClient(`/api/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', limit] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      for (const n of items) {
        if (!n.readAt) await apiClient(`/api/notifications/${n.id}/read`, { method: 'POST' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', limit] });
    },
  });

  return {
    items,
    unreadCount,
    nextCursor: data?.nextCursor || null,
    isLoading,
    refetch,
    markRead,
    markAllRead,
  };
}
