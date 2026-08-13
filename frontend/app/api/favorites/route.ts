import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import {
  getSessionUserId,
  backendFetch,
  ensureIndexes,
  apiError,
} from '@/lib/server';

interface TrainDetails {
  train?: {
    number: string;
    name?: string;
    source?: { code?: string; name?: string };
    destination?: { code?: string; name?: string };
  };
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  await ensureIndexes();
  const db = (await clientPromise).db();
  const rows = await db
    .collection('favorites')
    .find({ $or: [{ userId }, { deviceId: userId }] })
    .sort({ createdAt: -1 })
    .toArray();

  return NextResponse.json({
    success: true,
    data: rows.map((f: any) => ({
      trainNumber: f.trainNumber,
      trainName: f.trainName || '',
      origin: { code: f.fromCode || '', name: f.fromName || '' },
      destination: { code: f.toCode || '', name: f.toName || '' },
      createdAt: f.createdAt || null,
    })),
  });
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

  // The authenticated session is the only source of userId — any client
  // supplied userId is intentionally ignored.
  const trainNumber = String(body?.trainNumber || '')
    .trim()
    .replace(/[^0-9]/g, '');

  if (!/^\d{4,5}$/.test(trainNumber)) {
    return apiError('Invalid train number', 400, 'INVALID_TRAIN_NUMBER');
  }

  // Verify the train exists through the real train-data source (cached 24h in
  // Redis by the backend). Never against a hardcoded list.
  let details: TrainDetails;
  try {
    details = await backendFetch<TrainDetails>(`/trains/${trainNumber}`);
  } catch (err: any) {
    if (err?.status === 404 || err?.code === 'TRAIN_NOT_FOUND') {
      return apiError('Unable to verify this train.', 404, 'TRAIN_NOT_FOUND');
    }
    return apiError(
      'Unable to verify this train.',
      502,
      'TRAIN_SOURCE_UNAVAILABLE'
    );
  }

  const train = details?.train;
  if (!train?.number) {
    return apiError('Unable to verify this train.', 404, 'TRAIN_NOT_FOUND');
  }

  await ensureIndexes();
  const db = (await clientPromise).db();
  const collection = db.collection('favorites');

  // Remove any legacy Phase-2 row (keyed only by deviceId = userId) so the
  // unique { userId, trainNumber } index stays the single source of truth.
  await collection.deleteMany({ deviceId: userId, trainNumber });

  const existing = await collection.findOne({ userId, trainNumber });
  if (existing) {
    return NextResponse.json({
      success: true,
      data: { trainNumber, isFavorite: true, created: false },
    });
  }

  const now = new Date();
  const doc = {
    userId,
    deviceId: userId,
    trainNumber,
    trainName: train.name || '',
    fromCode: train.source?.code || '',
    fromName: train.source?.name || '',
    toCode: train.destination?.code || '',
    toName: train.destination?.name || '',
    createdAt: now,
    updatedAt: now,
  };
  await collection.insertOne(doc as any);
  return NextResponse.json(
    {
      success: true,
      data: {
        trainNumber,
        trainName: train.name,
        origin: { code: train.source?.code || '', name: train.source?.name || '' },
        destination: {
          code: train.destination?.code || '',
          name: train.destination?.name || '',
        },
        isFavorite: true,
        created: true,
      },
    },
    { status: 201 }
  );
}
