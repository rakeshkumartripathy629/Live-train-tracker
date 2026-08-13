'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Loader2 } from 'lucide-react';
import { usePnrStatus } from '@/hooks/usePnrStatus';
import { PnrStatusCard } from '@/components/pnr/PnrStatusCard';
import { PassengerList } from '@/components/pnr/PassengerList';
import { CoachPosition } from '@/components/pnr/CoachPosition';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorCard } from '@/components/ui/ErrorCard';
import { usePnrStore } from '@/store/pnr';

export default function PnrResultPage({ params }: { params: { pnr: string } }) {
  const pnr = params.pnr;
  const { data, isLoading, isError, error, refetch, isFetching } = usePnrStatus(pnr);
  const addRecentPnr = usePnrStore((s) => s.addRecentPnr);

  useEffect(() => {
    if (data?.train?.number) {
      addRecentPnr({ pnr, trainName: data.train.name, trainNumber: data.train.number });
    }
  }, [data, pnr, addRecentPnr]);

  return (
    <div className="space-y-5 py-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href="/pnr"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Check another PNR
        </Link>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">PNR {pnr}</span>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-3.5 py-2 text-xs font-semibold text-white shadow-glow transition-all hover:bg-sky-600 disabled:opacity-60"
          >
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-56 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      )}

      {isError && (
        <ErrorCard
          title="PNR Status Unavailable"
          message={(error as Error)?.message || 'Could not fetch PNR status. Please check the number and try again.'}
          onRetry={() => refetch()}
        />
      )}

      {data && (
        <>
          <PnrStatusCard status={data} />
          {data.train.coachPosition && <CoachPosition composition={data.train.coachPosition} />}
          <PassengerList passengers={data.passengers} probability={data.summary.probability} />
        </>
      )}
    </div>
  );
}
