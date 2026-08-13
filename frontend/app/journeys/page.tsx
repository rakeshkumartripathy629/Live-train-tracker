'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Luggage,
  Rocket,
  CalendarClock,
  CheckCircle2,
  XCircle,
  MapPin,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useLiveJourney } from '@/hooks/useLiveJourney';
import { Journey } from '@/types/journey';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { JourneyListItem } from '@/components/journey/JourneyListItem';
import { ActiveJourneyCard } from '@/components/journey/ActiveJourneyCard';

function SectionHeader({ icon, title, color }: { icon: React.ReactNode; title: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={color}>{icon}</div>
      <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
        {title}
      </h2>
    </div>
  );
}

export default function JourneysPage() {
  const { data: journeys, isLoading } = useQuery<Journey[]>({
    queryKey: ['journeys'],
    queryFn: () => apiClient<Journey[]>('/api/journeys'),
    staleTime: 15 * 1000,
  });

  const active = journeys?.find((j) => j.status === 'ACTIVE') || null;
  const upcoming = journeys?.filter((j) => j.status === 'PLANNED') || [];
  const completed = journeys?.filter((j) => j.status === 'COMPLETED') || [];
  const cancelled = journeys?.filter((j) => j.status === 'CANCELLED') || [];

  const { data: live, isLoading: liveLoading } = useLiveJourney(
    active?.trainNumber || '',
    active?.status === 'ACTIVE'
  );

  return (
    <RequireAuth>
      <div className="space-y-8 py-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rail-blue/10 text-rail-blue">
            <Luggage className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">My Journeys</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Apni trains track karo — boarding se destination tak, real RailRadar data ke saath.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full rounded-3xl" />
            <Skeleton className="h-24 w-full rounded-3xl" />
            <Skeleton className="h-24 w-full rounded-3xl" />
          </div>
        ) : journeys && journeys.length === 0 ? (
          <EmptyState
            title="No journeys yet"
            description="Kisi train ke live page par jao aur 'Track Journey' par click karke apna boarding aur destination chuno."
            action={
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-4 py-2 text-xs font-semibold text-white shadow-glow hover:bg-sky-600 transition-colors"
              >
                <MapPin className="h-4 w-4" />
                Search Trains
              </Link>
            }
          />
        ) : (
          <>
            {/* Active Journey */}
            {active && (
              <section className="space-y-3">
                <SectionHeader
                  icon={<Rocket className="h-4 w-4 text-emerald-600" />}
                  title="Active Journey"
                  color=""
                />
                <ActiveJourneyCard journey={active} live={live} isLoading={liveLoading} />
              </section>
            )}

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <section className="space-y-3">
                <SectionHeader
                  icon={<CalendarClock className="h-4 w-4 text-slate-600" />}
                  title={`Upcoming Journeys (${upcoming.length})`}
                  color=""
                />
                <div className="space-y-3">
                  {upcoming.map((j, i) => (
                    <JourneyListItem key={j.id} journey={j} index={i} />
                  ))}
                </div>
              </section>
            )}

            {/* Completed */}
            {completed.length > 0 && (
              <section className="space-y-3">
                <SectionHeader
                  icon={<CheckCircle2 className="h-4 w-4 text-sky-600" />}
                  title={`Completed Journeys (${completed.length})`}
                  color=""
                />
                <div className="space-y-3">
                  {completed.map((j, i) => (
                    <JourneyListItem key={j.id} journey={j} index={i} />
                  ))}
                </div>
              </section>
            )}

            {/* Cancelled */}
            {cancelled.length > 0 && (
              <section className="space-y-3">
                <SectionHeader
                  icon={<XCircle className="h-4 w-4 text-rose-500" />}
                  title={`Cancelled Journeys (${cancelled.length})`}
                  color=""
                />
                <div className="space-y-3">
                  {cancelled.map((j, i) => (
                    <JourneyListItem key={j.id} journey={j} index={i} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </RequireAuth>
  );
}
