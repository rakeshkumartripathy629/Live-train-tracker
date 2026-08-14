'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, MapPin, X, ChevronDown } from 'lucide-react';
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
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
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
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-9 text-sm font-semibold text-slate-900 shadow-sm outline-none transition-shadow placeholder:text-slate-400 focus:ring-2 focus:ring-rail-blue/40 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        {value ? (
          <button
            onClick={() => {
              onClear();
              setQuery('');
            }}
            aria-label="Clear station"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-rose-500"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
        )}
      </div>

      {open && query.trim().length >= 1 && (
        <div className="glass-panel absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 p-2 shadow-glass-hover dark:border-slate-800">
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
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-rail-blue/10"
            >
              <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {s.code}
              </span>
              <span className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
