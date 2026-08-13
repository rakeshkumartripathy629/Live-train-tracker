'use client';

import React from 'react';
import { Train, Info } from 'lucide-react';
import { cn } from '@/utils/cn';

interface CoachPositionProps {
  composition: string;
}

const COACH_STYLE: Record<string, { label: string; bg: string }> = {
  H1: { label: 'H1', bg: 'bg-slate-400 text-white' },
  A1: { label: 'A1', bg: 'bg-sky-500 text-white' },
  A2: { label: 'A2', bg: 'bg-sky-500 text-white' },
  B1: { label: 'B1', bg: 'bg-emerald-500 text-white' },
  B2: { label: 'B2', bg: 'bg-emerald-500 text-white' },
  PC: { label: 'PC', bg: 'bg-amber-500 text-white' },
  S1: { label: 'S1', bg: 'bg-violet-500 text-white' },
  S2: { label: 'S2', bg: 'bg-violet-500 text-white' },
  E1: { label: 'E1', bg: 'bg-rose-500 text-white' },
  E2: { label: 'E2', bg: 'bg-rose-500 text-white' },
  DL1: { label: 'DL1', bg: 'bg-rose-500 text-white' },
  L: { label: 'L', bg: 'bg-slate-400 text-white' },
};

function coachStyle(code: string) {
  const key = Object.keys(COACH_STYLE).find((k) => code.startsWith(k));
  if (key) return COACH_STYLE[key];
  if (/^A\d/.test(code)) return COACH_STYLE.A1;
  if (/^B\d/.test(code)) return COACH_STYLE.B1;
  if (/^S\d/.test(code)) return COACH_STYLE.S1;
  return { label: code, bg: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200' };
}

export function CoachPosition({ composition }: CoachPositionProps) {
  const coaches = composition.split('-').map((c) => c.trim()).filter(Boolean);

  return (
    <div className="glass-panel rounded-3xl p-6 shadow-glass space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
          <Train className="h-4 w-4 text-rail-blue" />
          Coach Position
        </h3>
        <span className="text-xs text-slate-400">{coaches.length} coaches</span>
      </div>

      <div className="overflow-x-auto pb-2 -mx-2 px-2">
        <div className="flex items-end gap-1.5 min-w-max">
          {coaches.map((coach, i) => {
            const style = coachStyle(coach);
            const isEngine = coach.toLowerCase().startsWith('engine');
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    'rounded-md px-2 py-1.5 font-mono text-[10px] font-bold shadow-sm',
                    isEngine ? 'bg-slate-800 text-white' : style.bg
                  )}
                >
                  {isEngine ? '🏠' : coach}
                </span>
                <span className="text-[8px] text-slate-400">{i + 1}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <Info className="h-3.5 w-3.5" />
        Engine se coach number — jahan aapka coach hai wahan platform par khade ho jao.
      </div>
    </div>
  );
}
