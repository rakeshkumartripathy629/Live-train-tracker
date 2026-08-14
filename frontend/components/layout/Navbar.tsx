'use client';

import React from 'react';
import Link from 'next/link';
import { Train, Search, Heart, Map, Ticket, ArrowLeftRight, Luggage, Bell, Bot, KeyRound } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/utils/cn';
import { useFavoritesStore } from '@/store/favorites';
import { PushToggle } from '@/components/alarm/PushToggle';
import { UserMenu } from '@/components/auth/UserMenu';
import { NotificationsBell } from '@/components/notifications/NotificationsBell';

export function Navbar() {
  const pathname = usePathname();
  const { favorites } = useFavoritesStore();

  const links = [
    { href: '/', label: 'Search', icon: Search, exact: true },
    { href: '/pnr', label: 'PNR', icon: Ticket, exact: false },
    { href: '/between', label: 'Routes', icon: ArrowLeftRight, exact: false },
    { href: '/station', label: 'Stations', icon: Map, exact: false },
    { href: '/journeys', label: 'Journeys', icon: Luggage, exact: false },
    { href: '/alarms', label: 'Alerts', icon: Bell, exact: false },
    { href: '/assistant', label: 'Assistant', icon: Bot, exact: false },
    { href: '/favorites', label: 'Favorites', icon: Heart, exact: false },
    { href: '/admin/keys', label: 'Keys', icon: KeyRound, exact: false },
  ];

  return (
    <header className="sticky top-0 z-50 w-full px-3 sm:px-4 pt-3">
      <div className="glass-panel mx-auto flex max-w-7xl items-center justify-between gap-2 rounded-2xl py-2.5 pl-4 pr-2.5 shadow-soft border border-slate-200/60 dark:border-slate-800/60">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group min-w-0">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-rail-gradient text-white shadow-glow transition-transform group-hover:scale-105">
            <Train className="h-5 w-5" />
          </div>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
              Rail<span className="text-rail-blue">Gaadi</span>
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-black tracking-widest text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 live-dot" aria-hidden />
              LIVE
            </span>
          </div>
        </Link>

        {/* Desktop nav — pill style */}
        <nav className="hidden lg:flex items-center gap-1">
          {links.map(({ href, label, icon: Icon, exact }) => {
            const isActive = exact ? pathname === href : pathname.startsWith(href);
            const isFav = href === '/favorites';
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200',
                  isActive
                    ? 'bg-slate-900 text-white shadow-md dark:bg-white dark:text-slate-900'
                    : 'text-slate-600 hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/5'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
                {isFav && favorites.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                    {favorites.length > 9 ? '9+' : favorites.length}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          <NotificationsBell />
          <PushToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
