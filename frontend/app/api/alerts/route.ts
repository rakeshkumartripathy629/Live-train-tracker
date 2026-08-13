import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import clientPromise from '@/lib/mongodb';
import { getSessionUserId, ensureIndexes, apiError } from '@/lib/server';
import {
  ALERT_TYPES,
  ALERT_CHANNELS,
  validateAlertInput,
  mapAlertDoc,
  type AlertCreateInput,
} from '@/lib/alerts';
import { isRateLimited } from '@/lib/rate-limit';

function toObjectId(id: string) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

/**
 * GET /api/alerts?journeyId=...  → list alerts for the signed-in user,
 * optionally filtered by journey. Never leaks other users' alerts.
 */
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  await ensureIndexes();
  const db = (await clientPromise).db();
  const coll = db.collection('alerts');

  const query: Record<string, unknown> = { userId };
  const journeyId = req.nextUrl.searchParams.get('journeyId');
  if (journeyId) query.journeyId = journeyId;

  const docs = await coll
    .find(query)
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray();
  return NextResponse.json({ success: true, data: docs.map(mapAlertDoc) });
}

/**
 * POST /api/alerts  → create an alert for one of the user's journeys.
 * Ownership of the journey is verified server-side; alerts are always attached
 * to the session user, never taken from the body.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  if (isRateLimited(`alerts:create:${userId}`, 20)) {
    return apiError('Too many requests, try again shortly', 429, 'RATE_LIMITED');
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON body', 400, 'INVALID_BODY');
  }

  const invalid = validateAlertInput(body);
  if (invalid) return apiError(invalid, 400, 'INVALID_ALERT');

  const input = body as AlertCreateInput;
  const type = String(input.alertType).toUpperCase();

  await ensureIndexes();
  const db = (await clientPromise).db();

  const journeyOid = toObjectId(input.journeyId);
  if (!journeyOid) return apiError('journeyId must be a valid ObjectId', 400, 'INVALID_JOURNEY');
  // Stored as hex string so the backend mongoose worker (which matches on
  // journey._id.toString()) sees the same value (§22).
  const journeyId = String(journeyOid);

  const journey = await db.collection('journeys').findOne({ _id: journeyOid, userId });
  if (!journey) return apiError('Journey not found', 404, 'NOT_FOUND');
  if (!journey.trainNumber) return apiError('Journey has no train number', 400, 'INVALID_JOURNEY');

  // Delay thresholds only make sense while the train is in the future/past of
  // the journey; a cancelled journey must never gain new alerts.
  if (journey.status === 'CANCELLED') {
    return apiError('Cannot add alerts to a cancelled journey', 400, 'JOURNEY_CANCELLED');
  }

  // One active alert per type per journey keeps the UI predictable and the
  // alert set reviewable.
  const existing = await db.collection('alerts').findOne({
    userId,
    journeyId,
    alertType: type,
    enabled: true,
  });
  if (existing) {
    return apiError('An enabled alert of this type already exists for the journey', 409, 'ALERT_EXISTS');
  }

  const now = new Date();
  const doc = {
    userId,
    journeyId,
    trainNumber: String(journey.trainNumber),
    alertType: type,
    targetStationCode: journey.destinationStationCode || null,
    targetStationName: journey.destinationStationName || journey.destinationStationCode || null,
    threshold:
      typeof input.threshold === 'number' && Number.isFinite(input.threshold) && input.threshold > 0
        ? input.threshold
        : null,
    channel: body.channel ? String(body.channel).toUpperCase() : 'PUSH',
    enabled: true,
    lastTriggeredAt: null,
    triggerCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  if (!ALERT_CHANNELS.includes(doc.channel as any)) {
    return apiError(`Channel ${doc.channel} is not supported`, 400, 'INVALID_CHANNEL');
  }
  if (!ALERT_TYPES.includes(type as any)) {
    return apiError('Invalid alertType', 400, 'INVALID_ALERT');
  }

  const { insertedId } = await db.collection('alerts').insertOne(doc);
  return NextResponse.json({ success: true, data: { id: insertedId.toString() } }, { status: 201 });
}
