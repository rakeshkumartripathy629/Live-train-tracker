import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getSessionUserId, ensureIndexes, apiError } from '@/lib/server';

export async function GET(
  _req: Request,
  { params }: { params: { trainNumber: string } }
) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  const trainNumber = params.trainNumber;
  await ensureIndexes();
  const db = (await clientPromise).db();
  const row = await db.collection('favorites').findOne({
    $or: [{ userId }, { deviceId: userId }],
    trainNumber,
  });

  return NextResponse.json({
    success: true,
    data: { isFavorite: Boolean(row) },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { trainNumber: string } }
) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  const trainNumber = params.trainNumber;
  await ensureIndexes();
  const db = (await clientPromise).db();
  const result = await db.collection('favorites').deleteMany({
    $or: [{ userId }, { deviceId: userId }],
    trainNumber,
  });

  return NextResponse.json({
    success: true,
    data: { deleted: result.deletedCount > 0 },
  });
}
