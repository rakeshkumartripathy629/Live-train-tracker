import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import {
  getSessionUserId,
  backendFetch,
  ensureIndexes,
  apiError,
  isValidJourneyDate,
  addDaysIST,
} from '@/lib/server';
import { JOURNEY_STATUSES, JourneyStatus, mapJourneyDoc } from '@/lib/journeys';

interface RouteStop {
  station?: { code?: string; name?: string; lat?: number; lng?: number };
  distance?: number;
  sequence?: number;
}

interface TrainDetails {
  train?: {
    number: string;
    name?: string;
    source?: { code?: string; name?: string };
    destination?: { code?: string; name?: string };
  };
  route?: RouteStop[];
}

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const journeyDate = searchParams.get('journeyDate');

  const filter: Record<string, unknown> = { userId };
  if (status) {
    if (!JOURNEY_STATUSES.includes(status as JourneyStatus)) {
      return apiError('Invalid status filter', 400, 'INVALID_STATUS');
    }
    filter.status = status;
  }
  if (journeyDate) {
    if (!isValidJourneyDate(journeyDate)) {
      return apiError('Invalid journeyDate filter (use YYYY-MM-DD)', 400, 'INVALID_DATE');
    }
    filter.journeyDate = journeyDate;
  }

  await ensureIndexes();
  const db = (await clientPromise).db();
  const rows = await db
    .collection('journeys')
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();

  return NextResponse.json({ success: true, data: rows.map(mapJourneyDoc) });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON body', 400, 'INVALID_BODY');
  }

  const trainNumber = String(body?.trainNumber || '')
    .trim()
    .replace(/[^0-9]/g, '');
  const boardingStationCode = String(body?.boardingStationCode || '')
    .trim()
    .toUpperCase();
  const destinationStationCode = String(body?.destinationStationCode || '')
    .trim()
    .toUpperCase();
  const journeyDate = String(body?.journeyDate || '').trim();

  if (!/^\d{4,5}$/.test(trainNumber)) {
    return apiError('Invalid train number', 400, 'INVALID_TRAIN_NUMBER');
  }
  if (!isValidJourneyDate(journeyDate)) {
    return apiError('Journey date must be a valid date in YYYY-MM-DD format', 400, 'INVALID_DATE');
  }
  const minDate = addDaysIST(0);
  const maxDate = addDaysIST(365);
  if (journeyDate < minDate) {
    return apiError('Journey date cannot be in the past', 400, 'INVALID_DATE');
  }
  if (journeyDate > maxDate) {
    return apiError('Journey date is too far in the future', 400, 'INVALID_DATE');
  }

  // Authoritative train data from the real source (cached by backend).
  let details: TrainDetails;
  try {
    details = await backendFetch<TrainDetails>(`/trains/${trainNumber}`);
  } catch (err: any) {
    if (err?.status === 404 || err?.code === 'TRAIN_NOT_FOUND') {
      return apiError('Unable to verify this train.', 404, 'TRAIN_NOT_FOUND');
    }
    return apiError('Unable to verify this train.', 502, 'TRAIN_SOURCE_UNAVAILABLE');
  }

  const train = details?.train;
  if (!train?.number) {
    return apiError('Unable to verify this train.', 404, 'TRAIN_NOT_FOUND');
  }

  const route = Array.isArray(details.route) ? details.route : [];
  const boardingIdx = route.findIndex(
    (r) => r.station?.code?.toUpperCase() === boardingStationCode
  );
  const destIdx = route.findIndex(
    (r) => r.station?.code?.toUpperCase() === destinationStationCode
  );

  if (boardingIdx === -1) {
    return apiError(
      `Station ${boardingStationCode} is not a stop on this train's route`,
      400,
      'INVALID_BOARDING_STATION'
    );
  }
  if (destIdx === -1) {
    return apiError(
      `Station ${destinationStationCode} is not a stop on this train's route`,
      400,
      'INVALID_DESTINATION_STATION'
    );
  }
  if (boardingIdx >= destIdx) {
    return apiError(
      'Boarding station must occur before destination station on the route',
      400,
      'INVALID_STATION_ORDER'
    );
  }

  await ensureIndexes();
  const db = (await clientPromise).db();
  const collection = db.collection('journeys');

  // Prevent obviously duplicated active journeys (same train + legs + date,
  // still PLANNED or ACTIVE).
  const duplicate = await collection.findOne({
    userId,
    trainNumber,
    boardingStationCode,
    destinationStationCode,
    journeyDate,
    status: { $in: ['PLANNED', 'ACTIVE'] },
  });
  if (duplicate) {
    return apiError(
      'An active journey for this train and date already exists',
      409,
      'DUPLICATE_JOURNEY'
    );
  }

  const boardingStop = route[boardingIdx];
  const destStop = route[destIdx];
  const now = new Date();

  const doc = {
    userId,
    trainNumber,
    trainName: train.name || '',
    origin: { code: train.source?.code || '', name: train.source?.name || '' },
    destination: { code: train.destination?.code || '', name: train.destination?.name || '' },
    boardingStationCode,
    boardingStationName: boardingStop.station?.name || boardingStationCode,
    destinationStationCode,
    destinationStationName: destStop.station?.name || destinationStationCode,
    journeyDate,
    status: 'PLANNED' as const,
    startedAt: null,
    completedAt: null,
    lastTrackedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const inserted = await collection.insertOne(doc);
  return NextResponse.json(
    { success: true, data: mapJourneyDoc({ _id: inserted.insertedId, ...doc }) },
    { status: 201 }
  );
}
