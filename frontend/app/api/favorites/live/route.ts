import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import {
  getSessionUserId,
  backendFetch,
  ensureIndexes,
  apiError,
} from '@/lib/server';

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON body', 400, 'INVALID_BODY');
  }

  await ensureIndexes();
  const db = (await clientPromise).db();
  const mine = await db
    .collection('favorites')
    .find({ $or: [{ userId }, { deviceId: userId }] })
    .project({ trainNumber: 1 })
    .toArray();
  const allowed = new Set(mine.map((f: any) => f.trainNumber));

  // Only batch live status for trains the authenticated user actually owns.
  const trainNumbers = (Array.isArray(body?.trainNumbers) ? body.trainNumbers : [])
    .map((n: unknown) => String(n).trim())
    .filter((n: string) => allowed.has(n))
    .slice(0, 20);

  if (trainNumbers.length === 0) {
    return apiError('No valid train numbers provided', 400, 'INVALID_TRAIN_NUMBERS');
  }

  const data = await backendFetch<Record<string, unknown>>('/trains/batch-live', {
    method: 'POST',
    body: JSON.stringify({ trainNumbers }),
  });

  return NextResponse.json({ success: true, data });
}
