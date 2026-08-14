'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Calendar, Clock, MapPin, Bell, ShieldCheck, AlertTriangle, TrainFront } from 'lucide-react';
import { PnrStatus } from '@/types/pnr';
import { TrainAvatar } from '@/components/ui/TrainAvatar';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';

interface PnrStatusCardProps {
  status: PnrStatus;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00+05:30');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDay(day: number): string {
  return day > 1 ? `+${day - 1}d` : 'Day 1';
}

export function PnrStatusCard({ status }: PnrStatusCardProps) {
  const { train } = status;

  const chartStyle = train.chartPrepared
    ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400'
    : 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400';

  return (
    <div className="glass-panel rounded-3xl p-6 shadow-glass space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <TrainAvatar number={train.number} size="md" />
          <div>
            <span className="font-mono text-xs font-bold text-rail-blue block">#{train.number}</span>
            <h2 className="font-extrabold text-lg text-slate-900 dark:text-white leading-tight">
              {train.name || 'Train'}
            </h2>
          </div>
        </div>
        <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold', chartStyle)}>
          {train.chartPrepared ? <ShieldCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          Chart {train.chartStatus}
        </span>
      </div>

      {status.demo && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
          <b>Demo data:</b> PNR service temporarily unavailable — sample status dikhaya ja raha hai.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">From</p>
          <p className="font-bold text-slate-900 dark:text-white">{train.fromName || train.from}</p>
          <p className="text-xs font-mono text-slate-500">{train.from} · {train.departureTime}</p>
        </div>
        <div className="flex items-center justify-center">
          <ArrowRight className="h-5 w-5 text-rail-blue" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">To</p>
          <p className="font-bold text-slate-900 dark:text-white">{train.toName || train.to}</p>
          <p className="text-xs font-mono text-slate-500">{train.to} · {train.arrivalTime}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
        <Info icon={<Calendar className="h-3.5 w-3.5" />} label="Journey Date" value={formatDate(train.journeyDate)} />
        <Info icon={<Clock className="h-3.5 w-3.5" />} label="Class" value={train.className || '—'} />
        <Info icon={<MapPin className="h-3.5 w-3.5" />} label="Quota" value={train.quota || '—'} />
        <Info
          icon={<TrainFront className="h-3.5 w-3.5" />}
          label="Platform"
          value={train.expectedPlatform ? `Platform ${train.expectedPlatform}` : '—'}
        />
      </div>

      {train.boardingPoint && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Boarding: <b>{train.boardingPoint}</b>
          {train.reservationUpto ? ` → Reservation up to ${train.reservationUpto}` : ''}
          {train.bookingFare ? ` · Fare ₹${train.bookingFare.toLocaleString('en-IN')}` : ''}
        </p>
      )}

      <Link href={`/train/${train.number}`} className="block">
        <Button variant="primary" size="lg" className="w-full">
          <Bell className="h-4 w-4" />
          Track This Train Live
        </Button>
      </Link>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
        {icon}
        {label}
      </div>
      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{value}</p>
    </div>
  );
}

export { formatDate, formatDay };
