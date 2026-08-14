'use client';

import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Search, Loader2, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import { StationSearchInput } from '@/components/between/StationSearchInput';
import { BetweenTrainCard } from '@/components/between/BetweenTrainCard';
import { useBetweenStations } from '@/hooks/useBetweenStations';
import { Station, BetweenTrain } from '@/types/station';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn } from '@/utils/cn';
import { groupBetweenTrains } from '@/lib/train-status';

function TrainSection({ title, trains }: { title: string; trains: BetweenTrain[] }) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="rail-heading text-sm text-slate-900 dark:text-white">
          {title}
        </h2>
        <span className="rounded-md bg-rail-blue/10 px-2 py-0.5 text-[11px] font-bold text-rail-blue">
          {trains.length}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {trains.map((t, i) => (
          <BetweenTrainCard key={t.number} train={t} index={i} />
        ))}
      </div>
    </section>
  );
}

function SectionEmpty({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3 text-xs font-semibold text-slate-400">
      {text}
    </p>
  );
}

export function BetweenStations() {
  const [from, setFrom] = useState<Station | null>(null);
  const [to, setTo] = useState<Station | null>(null);
  const [searchKey, setSearchKey] = useState(0);
  const [swapped, setSwapped] = useState(false);

  const { data, isLoading, isError, error, refetch } = useBetweenStations(
    from?.code || '',
    to?.code || '',
    false
  );

  const groups = useMemo(() => (data ? groupBetweenTrains(data.trains) : null), [data]);

  const search = () => {
    setSearchKey((k) => k + 1);
    refetch();
  };

  const canSearch = Boolean(from && to && from.code !== to.code);

  const swap = () => {
    const t = to;
    setTo(from);
    setFrom(t);
    setSwapped((s) => !s);
  };

  return (
    <div className="space-y-6 py-4 max-w-4xl mx-auto">
      <PageHeader
        icon={<ArrowLeftRight />}
        title="Trains Between Stations"
        description="Do stations ke beech chalne wali saari trains aur time table"
      />

      <div className="glass-panel rounded-3xl p-5 sm:p-6 shadow-glass space-y-4">
        <div className="flex flex-col gap-3">
          <StationSearchInput
            label="From Station"
            value={from?.code || ''}
            onSelect={(s) => setFrom(s)}
            onClear={() => setFrom(null)}
          />

          {/* Swap â€” full-width on mobile, inline on desktop */}
          <div className="flex items-center justify-center md:justify-end">
            <button
              onClick={swap}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-rail-blue hover:text-rail-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
              title="Swap stations"
              aria-label="Swap stations"
            >
              <motion.span
                key={String(swapped)}
                initial={{ rotate: 0, opacity: 1 }}
                animate={{ rotate: 180 }}
                transition={{ duration: 0.3 }}
                className="flex"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </motion.span>
            </button>
          </div>

          <StationSearchInput
            label="To Station"
            value={to?.code || ''}
            onSelect={(s) => setTo(s)}
            onClear={() => setTo(null)}
          />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          {from && to && (
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <MapPin className="h-3.5 w-3.5 text-rail-blue" />
              {from.name} ({from.code}) â†’ {to.name} ({to.code})
            </p>
          )}
          <button
            onClick={search}
            disabled={!canSearch || isLoading}
            className={cn(
              'inline-flex h-12 items-center gap-2 rounded-2xl px-6 text-sm font-bold transition-all',
              canSearch && !isLoading
                ? 'bg-rail-blue text-white shadow-glow hover:bg-sky-600 active:scale-95'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
            )}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Find Trains
          </button>
        </div>
      </div>

      {searchKey > 0 && data && groups && (
        <div className="space-y-4">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            <span className="text-rail-blue">{data.count}</span> train{data.count !== 1 ? 's' : ''} found
          </p>
          <div className="space-y-6">
            {groups.upcoming.length > 0 ? (
              <TrainSection title="Upcoming Trains" trains={groups.upcoming} />
            ) : (
              data.trains.length > 0 && <SectionEmpty text="No upcoming trains" />
            )}
            {groups.departed.length > 0 ? (
              <TrainSection title="Departed Trains" trains={groups.departed} />
            ) : (
              data.trains.length > 0 && <SectionEmpty text="No departed trains" />
            )}
            {groups.completed.length > 0 && (
              <TrainSection title="Completed" trains={groups.completed} />
            )}
            {groups.passedUnconfirmed.length > 0 && (
              <TrainSection title="Departure Passed â€” Unconfirmed" trains={groups.passedUnconfirmed} />
            )}
          </div>
        </div>
      )}

      {searchKey > 0 && data && data.trains.length === 0 && (
        <EmptyState
          title="No trains found"
          description="Is route pe koi direct train nahi mili. Kisi nearby station try karo."
        />
      )}

      {searchKey > 0 && isError && (
        <EmptyState
          title="Unable to load trains"
          description={(error as Error)?.message || 'RailRadar API se data nahi mila. API key check karo.'}
        />
      )}
    </div>
  );
}

