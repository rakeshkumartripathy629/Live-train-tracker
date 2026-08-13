import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import clientPromise from '@/lib/mongodb';
import { IST_TIMEZONE, istDateString, addDaysIST, isValidJourneyDate } from '@/lib/ist';

export { IST_TIMEZONE, istDateString, addDaysIST, isValidJourneyDate };

export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id || null;
}

export class BackendError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function backendApiUrl(): string {
  return (
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:4000/api/v1'
  ).replace(/\/$/, '');
}

/**
 * Server-side call to the Express backend (RailRadar proxy with Redis cache).
 * All live train data must flow through here — the backend is the only
 * component that talks to RailRadar.
 */
export async function backendFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${backendApiUrl()}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    cache: 'no-store',
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // empty / non-JSON body
  }

  if (!res.ok || !json?.success) {
    throw new BackendError(
      json?.error?.message || json?.error || `Backend request failed (${res.status})`,
      res.status,
      json?.code || json?.error?.code
    );
  }
  return json.data as T;
}

// ─── Indexes ─────────────────────────────────────────────────────────────

let indexPromise: Promise<void> | null = null;

/**
 * Ensure the Phase 3 indexes exist. createIndex is idempotent, so calling this
 * on every cold start (and lazily from API routes) is safe.
 */
export function ensureIndexes(): Promise<void> {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    const db = (await clientPromise).db();
    await db
      .collection('favorites')
      .createIndex({ userId: 1, trainNumber: 1 }, { unique: true });
    await db.collection('journeys').createIndex({ userId: 1, status: 1 });
    await db.collection('journeys').createIndex({ userId: 1, journeyDate: 1 });
    await db.collection('journeys').createIndex({ userId: 1, createdAt: 1 });
    // Phase 5 alert/notification indexes (idempotent; also synced by the
    // backend mongoose models).
    await db.collection('alerts').createIndex({ userId: 1, enabled: 1 });
    await db.collection('alerts').createIndex({ journeyId: 1, enabled: 1 });
    await db.collection('alerts').createIndex({ trainNumber: 1, enabled: 1 });
    await db.collection('alerts').createIndex({ journeyId: 1, alertType: 1 });
    await db
      .collection('notification_logs')
      .createIndex({ dedupeKey: 1 }, { unique: true, sparse: true });
    await db
      .collection('notification_logs')
      .createIndex({ userId: 1, createdAt: -1 });
    await db.collection('notification_logs').createIndex({ userId: 1, readAt: 1 });
    await db.collection('push_subscriptions').createIndex({ userId: 1 });
    await db
      .collection('push_subscriptions')
      .createIndex({ endpoint: 1 }, { unique: true });
  })().catch((err) => {
    indexPromise = null;
    throw err;
  });
  return indexPromise;
}

// ─── Error helper ────────────────────────────────────────────────────────

export function apiError(message: string, status = 400, code?: string) {
  return Response.json(
    { success: false, error: { code: code || 'BAD_REQUEST', message } },
    { status }
  );
}
