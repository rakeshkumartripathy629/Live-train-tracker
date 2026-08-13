'use client';

import { useSession } from 'next-auth/react';
import { getDeviceId } from '@/lib/api';

export function useUserId(): string | null {
  const { data: session } = useSession();
  return session?.user?.id ?? null;
}

export function useDeviceId(): string {
  const userId = useUserId();
  return userId || getDeviceId();
}
