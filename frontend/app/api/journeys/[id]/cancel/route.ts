import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getSessionUserId, ensureIndexes, apiError } from '@/lib/server';
import { runAction, JourneyError } from '@/lib/journeys';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  await ensureIndexes();
  const db = (await clientPromise).db();
  try {
    const updated = await runAction(db, userId, params.id, 'CANCEL');
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof JourneyError) {
      return apiError(err.message, err.status, err.code);
    }
    throw err;
  }
}
