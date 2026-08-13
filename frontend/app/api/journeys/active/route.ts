import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getSessionUserId, ensureIndexes, apiError } from '@/lib/server';
import { mapJourneyDoc } from '@/lib/journeys';

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  await ensureIndexes();
  const db = (await clientPromise).db();
  const active = await db.collection('journeys').findOne({
    userId,
    status: 'ACTIVE',
  });

  return NextResponse.json({
    success: true,
    data: active ? mapJourneyDoc(active) : null,
  });
}
