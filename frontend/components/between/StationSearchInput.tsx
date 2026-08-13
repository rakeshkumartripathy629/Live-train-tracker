'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { useStationSearch } from '@/hooks/useStationSearch';
import { Station } from '@/types/station';
import { cn } from '@/utils/cn';

interface StationSearchInputProps {
  label: string;
  value: string;
  onSelect: (station: Station) => void;
  onClear: () => void;
  placeholder?: string;
}

export function StationSearchInput({
  label,
  value,
  onSelect,
  onClear,
  placeholder = 'Station code (NDLS) ya naam...',
}: StationSearchInputProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useStationSearch(open ? query : '');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const results = data || [];

  return (
    <div ref={ref} className="relative flex-1">
      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
        {label}
      </label>
      <div className="relative">
        <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
          <MapPin className="h-4 w-4" />
        </div>
        <input
          value={open ? query : value || query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 py-3 pl-10 pr-9 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-rail-blue/40"
        />
        {value && (
          <button
            onClick={() => {
              onClear();
              setQuery('');
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && query.trim().length >= 1 && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 max-h-64 overflow-y-auto rounded-2xl glass-panel p-2 shadow-glass-hover border border-slate-200 dark:border-slate-800">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching stations...
            </div>
          )}
          {!isLoading && results.length === 0 && (
            <p className="py-4 text-center text-xs text-slate-400">No stations found.</p>
          )}
          {results.map((s) => (
            <button
              key={s.code}
              onClick={() => {
                onSelect(s);
                setQuery(s.code);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-rail-blue/10'
              )}
            >
              <span className="font-mono text-xs font-bold text-rail-blue">{s.code}</span>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
