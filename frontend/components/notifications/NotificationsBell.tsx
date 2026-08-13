'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/utils/cn';

/**
 * Navbar bell → notification center, with an unread badge. Only queries the
 * API when a session exists (anonymous users see no badge).
 */
export function NotificationsBell() {
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user?.id);

  const { unreadCount } = useNotifications(20, signedIn);

  return (
    <Link
      href="/notifications"
      className={cn(
        'relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all',
        'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
      )}
      title="Notifications"
    >
      <Bell className="h-4 w-4" />
      <span className="hidden md:inline">Inbox</span>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
