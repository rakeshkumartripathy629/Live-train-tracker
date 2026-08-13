// Single source of truth for classifying train status from real live + schedule
// data. Pure module (no imports) so it runs in the browser, Next.js server
// routes and Node unit tests via built-in type stripping.

export type TrainStatus =
  | 'UPCOMING'
  | 'DEPARTED'
  | 'COMPLETED'
  | 'DEPARTURE_PASSED_UNCONFIRMED';

export const IST_TZ = 'Asia/Kolkata';
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Real RailRadar/live statuses that positively confirm each bucket.
const COMPLETED_LIVE_TYPES = new Set(['completed', 'arrived']);
const NOT_DEPARTED_LIVE_TYPES = new Set(['at-station', 'upcoming', 'scheduled']);

export interface ScheduleTime {
  time: string;
  day: number;
}

export interface ClassifyTrainStatusInput {
  liveType?: string | null;
  scheduledDeparture?: ScheduleTime | null;
  actualDeparture?: ScheduleTime | null;
}

// Current calendar date in Asia/Kolkata, independent of browser timezone.
export function istParts(date: Date = new Date()): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m, d] = fmt.format(date).split('-').map(Number);
  return { y, m, d };
}

// Absolute epoch ms for a "HH:MM" schedule time on travel `day` (1-based),
// interpreted in Asia/Kolkata. Handles midnight crossing / next-day journeys
// because day offsets are applied to a real calendar date.
export function istInstant(time: string, day: number): number {
  const [hh, mm] = time.split(':').map(Number);
  if (!time || !Number.isFinite(hh) || !Number.isFinite(mm)) return NaN;
  const { y, m, d } = istParts();
  const dayOffset = Math.max(0, (day || 1) - 1);
  return Date.UTC(y, m - 1, d + dayOffset, hh, mm) - IST_OFFSET_MS;
}

// Priority: (1) real live status, (2) actual departure timestamp,
// (3) scheduled departure as a fallback only. Never claims "departed"
// without evidence.
export function classifyTrainStatus(input: ClassifyTrainStatusInput): TrainStatus {
  const liveType = (input.liveType || '').trim().toLowerCase();

  if (COMPLETED_LIVE_TYPES.has(liveType)) return 'COMPLETED';
  if (liveType === 'departed') return 'DEPARTED';

  if (input.actualDeparture?.time) {
    if (!Number.isNaN(istInstant(input.actualDeparture.time, input.actualDeparture.day || 1))) {
      return 'DEPARTED';
    }
  }

  if (NOT_DEPARTED_LIVE_TYPES.has(liveType)) return 'UPCOMING';

  const dep = input.scheduledDeparture?.time
    ? istInstant(input.scheduledDeparture.time, input.scheduledDeparture.day || 1)
    : NaN;
  if (Number.isNaN(dep)) return 'DEPARTURE_PASSED_UNCONFIRMED';
  return dep > Date.now() ? 'UPCOMING' : 'DEPARTURE_PASSED_UNCONFIRMED';
}

export interface BetweenTrainLike {
  from: { departure: string; day: number };
  live?: { type?: string } | null;
}

export function classifyBetween(train: BetweenTrainLike): TrainStatus {
  return classifyTrainStatus({
    liveType: train.live?.type,
    scheduledDeparture: { time: train.from.departure, day: train.from.day },
  });
}

export function departureInstant(train: BetweenTrainLike): number {
  return istInstant(train.from.departure, train.from.day);
}

export interface TrainGroups<T> {
  upcoming: T[];
  departed: T[];
  completed: T[];
  passedUnconfirmed: T[];
}

export function groupBetweenTrains<T extends BetweenTrainLike>(trains: T[]): TrainGroups<T> {
  const groups: TrainGroups<T> = {
    upcoming: [],
    departed: [],
    completed: [],
    passedUnconfirmed: [],
  };
  for (const train of trains) {
    const status = classifyBetween(train);
    if (status === 'UPCOMING') groups.upcoming.push(train);
    else if (status === 'DEPARTED') groups.departed.push(train);
    else if (status === 'COMPLETED') groups.completed.push(train);
    else groups.passedUnconfirmed.push(train);
  }
  groups.upcoming.sort((a, b) => departureInstant(a) - departureInstant(b));
  groups.departed.sort((a, b) => departureInstant(b) - departureInstant(a));
  groups.completed.sort((a, b) => departureInstant(b) - departureInstant(a));
  groups.passedUnconfirmed.sort((a, b) => departureInstant(a) - departureInstant(b));
  return groups;
}

export interface StatusMeta {
  label: string;
  badge: string;
  dot: string;
  description: string;
}

export const TRAIN_STATUS_META: Record<TrainStatus, StatusMeta> = {
  UPCOMING: {
    label: 'Upcoming',
    badge: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    description: 'You can still catch this train.',
  },
  DEPARTED: {
    label: 'Departed',
    badge: 'bg-rail-blue/10 text-rail-blue border-rail-blue/30 dark:text-sky-400',
    dot: 'bg-rail-blue',
    description: 'This train has already left.',
  },
  COMPLETED: {
    label: 'Completed',
    badge: 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-400',
    dot: 'bg-sky-500',
    description: 'This train has reached its destination.',
  },
  DEPARTURE_PASSED_UNCONFIRMED: {
    label: 'Time passed',
    badge: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400',
    dot: 'bg-amber-500',
    description: 'Departure time passed — live status unavailable.',
  },
};
