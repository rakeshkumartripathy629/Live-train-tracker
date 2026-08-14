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
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { JourneyListItem } from '@/components/journey/JourneyListItem';
import { ActiveJourneyCard } from '@/components/journey/ActiveJourneyCard';

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        {icon}
      </div>
      <h2 className="rail-heading text-sm text-slate-900 dark:text-white">{title}</h2>
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
        <PageHeader
          icon={<Luggage />}
          title="My Journeys"
          description="Apni trains track karo â€” boarding se destination tak, real RailRadar data ke saath."
        />

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
              <Link href="/" className="inline-flex items-center gap-2">
                <Button variant="primary" size="md">
                  <MapPin className="h-4 w-4" />
                  Search Trains
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            {/* Active Journey */}
            {active && (
              <section className="space-y-3">
                <SectionHeader
                  icon={<Rocket className="h-4 w-4 text-emerald-500" />}
                  title="Active Journey"
                />
                <ActiveJourneyCard journey={active} live={live} isLoading={liveLoading} />
              </section>
            )}

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <section className="space-y-3">
                <SectionHeader
                  icon={<CalendarClock className="h-4 w-4 text-slate-500" />}
                  title={`Upcoming Journeys (${upcoming.length})`}
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
                  icon={<CheckCircle2 className="h-4 w-4 text-sky-500" />}
                  title={`Completed Journeys (${completed.length})`}
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

