'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Train, ArrowRight, CalendarDays } from 'lucide-react';
import { Journey, JourneyStatus } from '@/types/journey';
import { cn } from '@/utils/cn';

const STATUS_CHIP: Record<JourneyStatus, string> = {
  PLANNED: 'bg-slate-500/15 text-slate-600 border-slate-500/30 dark:text-slate-300',
  ACTIVE: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
  COMPLETED: 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-400',
  CANCELLED: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-400',
};

export function JourneyListItem({ journey, index }: { journey: Journey; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
    >
      <Link
        href={`/journeys/${journey.id}`}
        className="glass-panel group flex items-center justify-between gap-3 rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glass-hover"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-rail-blue/10 text-rail-blue group-hover:bg-rail-blue group-hover:text-white transition-colors">
            <Train className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[11px] font-bold text-rail-blue">
                #{journey.trainNumber}
              </span>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                  STATUS_CHIP[journey.status]
                )}
              >
                {journey.status}
              </span>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate mt-0.5">
              {journey.trainName}
            </h3>
            <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              <span className="truncate">{journey.boardingStationName}</span>
              <ArrowRight className="h-2.5 w-2.5 flex-shrink-0" />
              <span className="truncate">{journey.destinationStationName}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <CalendarDays className="h-3 w-3" />
            {journey.journeyDate}
          </span>
          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-rail-blue group-hover:translate-x-0.5 transition-all" />
        </div>
      </Link>
    </motion.div>
  );
}
