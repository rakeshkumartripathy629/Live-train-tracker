'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Search,
  Luggage,
  Bell,
  MoreHorizontal,
  Ticket,
  Map,
  Bot,
  Heart,
  Inbox,
  KeyRound,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useFavoritesStore } from '@/store/favorites';
import { BottomSheet } from '@/components/ui/BottomSheet';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home, exact: true },
  { href: '/between', label: 'Search', icon: Search, exact: false },
  { href: '/journeys', label: 'Journeys', icon: Luggage, exact: false },
  { href: '/alarms', label: 'Alerts', icon: Bell, exact: false },
];

const MORE_ITEMS = [
  { href: '/pnr', label: 'PNR Status', icon: Ticket, iconClass: 'bg-rail-blue/10 text-rail-blue' },
  { href: '/station', label: 'Stations', icon: Map, iconClass: 'bg-emerald-500/10 text-emerald-600' },
  { href: '/assistant', label: 'AI Assistant', icon: Bot, iconClass: 'bg-violet-500/10 text-violet-500' },
  { href: '/favorites', label: 'Favorites', icon: Heart, iconClass: 'bg-rose-500/10 text-rose-500' },
  { href: '/notifications', label: 'Notifications', icon: Inbox, iconClass: 'bg-amber-500/10 text-amber-600' },
  { href: '/admin/keys', label: 'API Keys', icon: KeyRound, iconClass: 'bg-slate-500/10 text-slate-600' },
];

export function BottomNav() {
  const pathname = usePathname();
  const { favorites } = useFavoritesStore();
  const [moreOpen, setMoreOpen] = useState(false);

  const activeInMore = MORE_ITEMS.some((i) =>
    i.href === '/pnr'
      ? pathname.startsWith('/pnr')
      : pathname.startsWith(i.href)
  );

  return (
    <>
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      >
        <div className="glass-panel mx-2.5 mb-2.5 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 shadow-lift overflow-hidden safe-bottom">
          <div className="flex items-stretch justify-around px-1 py-1.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
              const isActive = exact ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 transition-all duration-200',
                    isActive ? 'text-rail-blue' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200',
                      isActive && 'bg-rail-blue/12'
                    )}
                  >
                    <Icon className={cn('h-5 w-5 transition-transform', isActive && 'scale-110')} />
                  </span>
                  <span className="text-[10px] font-semibold">{label}</span>
                </Link>
              );
            })}

            {/* More button */}
            <button
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              aria-label="More options"
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 transition-all duration-200',
                activeInMore && !moreOpen ? 'text-rail-blue' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              )}
            >
              <span className={cn('relative flex h-7 w-12 items-center justify-center rounded-full', activeInMore && !moreOpen && 'bg-rail-blue/12')}>
                <MoreHorizontal className="h-5 w-5" />
                {favorites.length > 0 && (
                  <span className="absolute -top-1 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[8px] font-bold text-white">
                    {favorites.length > 9 ? '9+' : favorites.length}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-semibold">More</span>
            </button>
          </div>
        </div>
      </nav>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid grid-cols-2 gap-2 px-4 pb-6 pt-1 sm:grid-cols-3">
          {MORE_ITEMS.map(({ href, label, icon: Icon, iconClass }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-2xl border p-3.5 transition-all',
                  isActive
                    ? 'border-rail-blue/40 bg-rail-blue/5'
                    : 'border-slate-200 dark:border-slate-800 hover:border-rail-blue/30 hover:bg-rail-blue/5'
                )}
              >
                <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', iconClass)}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{label}</span>
              </Link>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}
