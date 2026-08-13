import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import {
  getSessionUserId,
  backendFetch,
  ensureIndexes,
  apiError,
} from '@/lib/server';
import {
  mapJourneyDoc,
  getOwnedJourney,
  applyTransition,
  JourneyError,
} from '@/lib/journeys';

function journeyProgress(journey: any, liveStations: any[]) {
  const boarding = liveStations.find(
    (s) => s.code === journey.boardingStationCode
  );
  const dest = liveStations.find(
    (s) => s.code === journey.destinationStationCode
  );
  if (!boarding || !dest || dest.distanceKm <= boarding.distanceKm) return null;

  const current =
    liveStations.find((s) => s.status === 'current')?.distanceKm ||
    liveStations.find((s) => s.status === 'passed')?.distanceKm ||
    0;
  const pct = ((current - boarding.distanceKm) / (dest.distanceKm - boarding.distanceKm)) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  await ensureIndexes();
  const db = (await clientPromise).db();
  const journey = await getOwnedJourney(db, userId, params.id);
  if (!journey) return apiError('Journey not found', 404, 'NOT_FOUND');

  // Live train status comes from RailRadar (through the backend cache).
  // MongoDB stores only the journey metadata — never the live position.
  let live: { available: boolean; data?: any; error?: string } = {
    available: false,
  };
  if (journey.status === 'ACTIVE') {
    try {
      const data = await backendFetch<any>(`/trains/${journey.trainNumber}/live`);
      if (data) {
        live = { available: true, data };
        await db.collection('journeys').updateOne(
          { _id: journey._id },
          { $set: { lastTrackedAt: new Date() } }
        );
      }
    } catch (err: any) {
      live = {
        available: false,
        error: err?.message || 'Live information temporarily unavailable',
      };
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      ...mapJourneyDoc(journey),
      journeyProgress:
        live.available && Array.isArray(live.data?.stations)
          ? journeyProgress(journey, live.data.stations)
          : null,
      live,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON body', 400, 'INVALID_BODY');
  }

  const action = String(body?.action || '').toUpperCase();
  if (!['START', 'COMPLETE', 'CANCEL'].includes(action)) {
    return apiError('action must be START, COMPLETE or CANCEL', 400, 'INVALID_ACTION');
  }

  await ensureIndexes();
  const db = (await clientPromise).db();
  const journey = await getOwnedJourney(db, userId, params.id);
  if (!journey) return apiError('Journey not found', 404, 'NOT_FOUND');

  try {
    const updated = await applyTransition(db, journey, action as any);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof JourneyError) {
      return apiError(err.message, err.status, err.code);
    }
    throw err;
  }
}
