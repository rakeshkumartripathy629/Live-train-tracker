'use client';

import React from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { LogIn, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useSession();

  if (status === 'loading') {
    return (
      <div className="space-y-4 py-6">
        <Skeleton className="h-10 w-48 rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-3xl" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="mx-auto max-w-md py-16 text-center space-y-5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-rail-blue/10 text-rail-blue">
          <LogIn className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Sign in to continue
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Login karo to apne favorites, alerts aur journey history ko har device par sync rakho.
          </p>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-5 py-2.5 text-sm font-bold text-white shadow-glow hover:bg-sky-600 transition-colors"
        >
          Sign In
        </Link>
        <p className="text-xs text-slate-400">
          New here?{' '}
          <Link href="/register" className="font-bold text-rail-blue hover:underline">
            Create a free account
          </Link>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
