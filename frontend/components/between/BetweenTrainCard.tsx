'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, ArrowRight, MapPin, CalendarDays, AlertTriangle } from 'lucide-react';
import { BetweenTrain } from '@/types/station';
import { TrainAvatar, trainTone, TRAIN_TONE_STYLE } from '@/components/ui/TrainAvatar';
import { cn } from '@/utils/cn';

interface BetweenTrainCardProps {
  train: BetweenTrain;
  index?: number;
}

/**
 * Premium train row for the between-stations list. Renders only real API data;
 * missing fields (halts, run days, live) are simply omitted.
 */
export function BetweenTrainCard({ train, index = 0 }: BetweenTrainCardProps) {
  const tone = trainTone(train.type);
  const isLate = (train.live?.delayMinutes ?? 0) > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
    >
      <Link
        href={`/train/${train.number}`}
        className="card-surface group relative block overflow-hidden rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift sm:p-5"
      >
        <div className={cn('absolute inset-x-0 top-0 h-0.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100', TRAIN_TONE_STYLE[tone].tile)} />

        {/* Train identity */}
        <div className="flex items-center gap-3.5">
          <TrainAvatar number={train.number} type={train.type} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded-md bg-rail-blue/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rail-blue">
                {train.number}
              </span>
              <span className="truncate text-[11px] font-semibold text-slate-400">{train.name}</span>
              {isLate && train.live && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  +{train.live.delayMinutes} min
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate font-semibold">{train.from.departure}</span>
              <ArrowRight className="h-3 w-3 flex-shrink-0 text-slate-300 dark:text-slate-600" />
              <span className="truncate font-semibold">{train.to.arrival}</span>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-rail-blue dark:text-slate-600" />
        </div>

        {/* Meta chips */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
          <span className="tnum inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <Clock className="h-3 w-3 text-rail-blue" />
            Dep {train.from.departure}
          </span>
          <span className="tnum inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            Arr {train.to.arrival}
          </span>
          <span className="tnum inline-flex items-center gap-1 rounded-full bg-rail-blue/10 px-2.5 py-1 text-rail-blue">
            {Math.floor(train.duration / 60)}h {train.duration % 60}m
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <MapPin className="h-3 w-3 text-slate-400" />
            {train.distance} km
          </span>
          {train.totalHaltsBetween > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <CalendarDays className="h-3 w-3 text-slate-400" />
              {train.totalHaltsBetween} halts
            </span>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
