'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Heart, Loader2, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthFavorites } from '@/hooks/useAuthFavorites';
import { SearchResult } from '@/types/train';
import { cn } from '@/utils/cn';

interface FavoriteButtonProps {
  train: SearchResult;
  className?: string;
  size?: 'sm' | 'md';
}

export function FavoriteButton({ train, className, size = 'md' }: FavoriteButtonProps) {
  const { isUser, isFavorite, toggle, pending } = useAuthFavorites();
  const [showLogin, setShowLogin] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const trainId = train.id || train.number;
  const isFav = isUser ? isFavorite(trainId) : false;

  useEffect(() => {
    if (!showLogin) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowLogin(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLogin]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUser) {
      setShowLogin((v) => !v);
      return;
    }
    if (!pending) toggle(train);
  };

  return (
    <div ref={popoverRef} className="relative">
      <button
        onClick={handleClick}
        title={
          !isUser
            ? 'Sign in to save favorites'
            : isFav
            ? 'Remove from favorites'
            : 'Add to favorites'
        }
        className={cn(
          'flex items-center justify-center rounded-xl transition-all duration-200 active:scale-90',
          size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
          !isUser
            ? 'bg-slate-200/60 dark:bg-slate-800/60 text-slate-400 hover:bg-rail-blue/10 hover:text-rail-blue'
            : isFav
            ? 'bg-rose-500/15 text-rose-500 hover:bg-rose-500/25'
            : 'bg-slate-200/60 dark:bg-slate-800/60 text-slate-400 hover:bg-rose-500/15 hover:text-rose-500',
          className
        )}
      >
        {pending && isUser ? (
          <Loader2
            className={cn(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4', 'animate-spin')}
            style={{ width: size === 'sm' ? 14 : 18, height: size === 'sm' ? 14 : 18 }}
          />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={isFav ? 'fav' : 'unfav'}
              initial={{ scale: 0.6, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.6, rotate: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <Heart
                className={cn(isFav && 'fill-current')}
                style={{ width: size === 'sm' ? 14 : 18, height: size === 'sm' ? 14 : 18 }}
              />
            </motion.div>
          </AnimatePresence>
        )}
      </button>

      <AnimatePresence>
        {showLogin && !isUser && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl glass-panel p-4 shadow-glass-hover border border-slate-200 dark:border-slate-800"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rail-blue/10 text-rail-blue">
                <LogIn className="h-4 w-4" />
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                Sign in to save favorites
              </p>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Apne favorites aur journeys ko har device par sync rakho.
            </p>
            <Link
              href="/login"
              onClick={() => setShowLogin(false)}
              className="block w-full rounded-xl bg-rail-blue px-3 py-2 text-center text-xs font-bold text-white shadow-glow hover:bg-sky-600 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              onClick={() => setShowLogin(false)}
              className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors mt-2"
            >
              Create account
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
