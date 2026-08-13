import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getSessionUserId, ensureIndexes, apiError } from '@/lib/server';
import { mapNotificationDoc } from '@/lib/alerts';

/**
 * GET /api/notifications?limit=20&before=<iso> → the signed-in user's
 * notification log, newest first with cursor pagination. Only statuses that
 * represent real deliveries or failures are shown (never draft rows).
 */
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  await ensureIndexes();
  const db = (await clientPromise).db();

  const limitRaw = Number(req.nextUrl.searchParams.get('limit') || 20);
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));
  const beforeRaw = req.nextUrl.searchParams.get('before');

  const query: Record<string, unknown> = { userId };
  if (beforeRaw && !Number.isNaN(Date.parse(beforeRaw))) {
    query.createdAt = { $lt: new Date(beforeRaw) };
  }

  const docs = await db
    .collection('notification_logs')
    .find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray();

  const items = docs.map(mapNotificationDoc);
  const nextCursor = items.length === limit ? items[items.length - 1].createdAt : null;

  return NextResponse.json({ success: true, data: { items, nextCursor } });
}
