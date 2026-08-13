import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getSessionUserId, ensureIndexes, apiError } from '@/lib/server';

function toObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id) ? id : null;
}

/**
 * POST /api/notifications/[id]/read → mark one notification as read.
 * Ownership is scoped to the session user — 404 for other users' rows.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  const oid = toObjectId(params.id);
  if (!oid) return apiError('Invalid notification id', 400, 'INVALID_ID');

  await ensureIndexes();
  const db = (await clientPromise).db();
  const res = await db.collection('notification_logs').updateOne(
    { _id: oid as any, userId },
    { $set: { readAt: new Date(), updatedAt: new Date() } }
  );
  if (res.matchedCount === 0) return apiError('Notification not found', 404, 'NOT_FOUND');
  return NextResponse.json({ success: true, data: { id: params.id, read: true } });
}
