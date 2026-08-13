'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { User, LogIn, LogOut, Heart, Bell } from 'lucide-react';

export function UserMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (status === 'loading') return null;

  if (!session?.user) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 rounded-xl bg-rail-blue px-3.5 py-2 text-xs font-bold text-white shadow-glow transition-colors hover:bg-sky-600"
      >
        <LogIn className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Sign In</span>
      </Link>
    );
  }

  const initial = (session.user.name || session.user.email || 'U').charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rail-blue to-sky-700 text-sm font-bold text-white shadow-glow ring-2 ring-white/20 transition-transform hover:scale-105"
        aria-label="Account menu"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-2xl glass-panel p-2 shadow-glass-hover border border-slate-200 dark:border-slate-800">
          <div className="px-3 py-2 border-b border-slate-200/60 dark:border-slate-800/60">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {session.user.name || 'User'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {session.user.email}
            </p>
          </div>
          <div className="pt-1 space-y-0.5">
            <button
              onClick={() => { setOpen(false); router.push('/favorites'); }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Heart className="h-4 w-4 text-rose-500" />
              My Favorites
            </button>
            <button
              onClick={() => { setOpen(false); router.push('/alarms'); }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Bell className="h-4 w-4 text-amber-500" />
              My Alerts
            </button>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
