'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { apiRequest } from '@/lib/api';
import { Bell, BellRing } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Web Push subscription. Works for anonymous users too (legacy alarm flow uses
 * localStorage); when signed in, the subscription is ALSO registered with the
 * Phase 5 notification engine (/api/notifications/push/subscribe) so the
 * backend can deliver journey alerts to it.
 */
export function PushToggle() {
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user?.id);
  const [supported] = useState(() => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [busy, setBusy] = useState(false);

  const syncToBackend = useCallback(
    async (sub: PushSubscription | null) => {
      if (!signedIn) return;
      try {
        if (sub) {
          await apiRequest('/api/notifications/push/subscribe', {
            method: 'POST',
            body: {
              subscription: sub.toJSON(),
              device: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : 'unknown',
            },
          });
        }
      } catch (e) {
        console.warn('Push registration failed:', e);
      }
    },
    [signedIn]
  );

  useEffect(() => {
    if (!supported) return;
    apiRequest<{ publicKey: string | null }>('/push-key')
      .then((d) => setPublicKey(d.publicKey))
      .catch(() => setPublicKey(null));
    setPermission(Notification.permission);
  }, [supported]);

  const subscribe = async () => {
    if (!supported || !publicKey) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }
      localStorage.setItem('railgaadi-push-sub', JSON.stringify(sub.toJSON()));
      await syncToBackend(sub);
      setPermission(Notification.permission);
    } catch (e) {
      console.warn('Push subscription failed:', e);
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        localStorage.removeItem('railgaadi-push-sub');
        if (signedIn) {
          try {
            await apiRequest('/api/notifications/push/subscribe', {
              method: 'DELETE',
              body: { subscription: sub.toJSON() },
            });
          } catch (e) {
            console.warn('Push removal failed:', e);
          }
        }
        await sub.unsubscribe();
        setPermission(Notification.permission);
      }
    } catch (e) {
      console.warn('Push unsubscribe failed:', e);
    } finally {
      setBusy(false);
    }
  };

  if (!supported) return null;

  const enabled = permission === 'granted';
  const unavailable = !publicKey;

  return (
    <button
      onClick={enabled ? unsubscribe : subscribe}
      disabled={unavailable || busy}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors',
        enabled
          ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 dark:text-emerald-400'
          : unavailable
          ? 'bg-slate-200/60 dark:bg-slate-800/60 text-slate-400 cursor-not-allowed'
          : 'bg-slate-200/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700'
      )}
      title={enabled ? 'Notifications enabled (click to disable)' : unavailable ? 'Push keys not configured on backend' : 'Enable notifications'}
    >
      {busy ? (
        <span className="h-4 w-4 animate-pulse rounded-full bg-current" />
      ) : enabled ? (
        <BellRing className="h-4 w-4" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">{enabled ? 'Notifications On' : 'Enable Alerts'}</span>
    </button>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
