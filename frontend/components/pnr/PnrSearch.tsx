'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ticket, Search, X, History } from 'lucide-react';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/ui/PageHeader';
import { usePnrStore } from '@/store/pnr';

export function PnrSearch() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const { recentPnrs, clearRecentPnrs } = usePnrStore();
  const isValid = /^\d{10}$/.test(value.trim());

  const submit = (pnr?: string) => {
    const p = (pnr ?? value).trim();
    if (!/^\d{10}$/.test(p)) {
      setError('PNR 10-digit number hona chahiye');
      return;
    }
    setError('');
    setValue('');
    router.push(`/pnr/${p}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Ticket />}
        title="PNR Status"
        description="IRCTC PNR number dalo â€” booking status, coach & berth turant dekho"
      />

      <div className="glass-panel rounded-3xl p-5 md:p-8 shadow-glass">
        <div className="flex flex-col sm:flex-row gap-3 max-w-xl">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              value={value}
              onChange={(e) => {
                setValue(e.target.value.replace(/\D/g, ''));
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Enter 10-digit PNR number"
              className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-10 text-sm font-semibold text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-rail-blue/40 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            {value && (
              <button
                onClick={() => setValue('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => submit()}
            disabled={!isValid}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold transition-all h-12',
              isValid
                ? 'bg-rail-blue text-white shadow-glow hover:bg-sky-600 active:scale-95'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
            )}
          >
            <Ticket className="h-4 w-4" />
            Check Status
          </button>
        </div>

        {error && <p className="mt-3 text-xs font-semibold text-rose-500">{error}</p>}
      </div>

      {recentPnrs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
              <History className="h-4 w-4 text-rail-blue" />
              Recent PNR Checks
            </div>
            <button
              onClick={clearRecentPnrs}
              className="text-xs font-semibold text-slate-400 hover:text-rose-500 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentPnrs.map((p) => (
              <button
                key={p.pnr}
                onClick={() => submit(p.pnr)}
                className="glass-panel group flex items-center justify-between rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-glass-hover"
              >
                <div className="min-w-0">
                  <span className="font-mono text-sm font-bold text-rail-blue block">{p.pnr}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate block">
                    {p.trainNumber ? `#${p.trainNumber} Â· ` : ''}{p.trainName || 'PNR check'}
                  </span>
                </div>
                <Search className="h-4 w-4 text-slate-400 flex-shrink-0 group-hover:text-rail-blue" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

