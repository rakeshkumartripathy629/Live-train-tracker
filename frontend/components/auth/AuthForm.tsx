'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Train, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/utils/cn';

interface AuthFormProps {
  mode: 'login' | 'register';
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error || 'Registration failed');
          setLoading(false);
          return;
        }
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
        setLoading(false);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="glass-panel rounded-3xl p-8 shadow-glass space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rail-blue text-white shadow-glow">
            <Train className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {mode === 'login'
              ? 'Sign in to sync favorites, alerts & journeys across devices'
              : 'One account — favorites, alerts & journey history everywhere'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">
                Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl border border-slate-200 bg-slate-100/50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-rail-blue focus:bg-white dark:border-slate-800 dark:bg-slate-900/50 dark:text-white dark:focus:bg-slate-900"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-200 bg-slate-100/50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-rail-blue focus:bg-white dark:border-slate-800 dark:bg-slate-900/50 dark:text-white dark:focus:bg-slate-900"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full rounded-xl border border-slate-200 bg-slate-100/50 px-4 py-3 pr-11 text-sm font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-rail-blue focus:bg-white dark:border-slate-800 dark:bg-slate-900/50 dark:text-white dark:focus:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full rounded-xl bg-rail-blue px-4 py-3 text-sm font-bold text-white shadow-glow transition-all',
              'hover:bg-sky-600 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none'
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {mode === 'login' ? 'Signing in...' : 'Creating account...'}
              </span>
            ) : mode === 'login' ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {/* Switch mode */}
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <Link
            href={mode === 'login' ? '/register' : '/login'}
            className="font-bold text-rail-blue hover:underline"
          >
            {mode === 'login' ? 'Sign up free' : 'Sign in'}
          </Link>
        </p>
      </div>
    </div>
  );
}
