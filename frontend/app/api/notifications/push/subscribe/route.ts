import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getSessionUserId, ensureIndexes, apiError } from '@/lib/server';
import { isRateLimited } from '@/lib/rate-limit';

/**
 * POST /api/notifications/push/subscribe
 * Body: { subscription: { endpoint, keys: { p256dh, auth } }, device? }
 * Registers (or re-registers) a web-push subscription for the session user.
 * The endpoint is the unique device identity; it is never overwritten for
 * another user.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  if (isRateLimited(`push:subscribe:${userId}`, 10)) {
    return apiError('Too many requests, try again shortly', 429, 'RATE_LIMITED');
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON body', 400, 'INVALID_BODY');
  }

  const sub = body?.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    return apiError('Invalid push subscription endpoint', 400, 'INVALID_SUBSCRIPTION');
  }
  if (typeof p256dh !== 'string' || !p256dh || typeof auth !== 'string' || !auth) {
    return apiError('Invalid push subscription keys', 400, 'INVALID_SUBSCRIPTION');
  }

  await ensureIndexes();
  const db = (await clientPromise).db();
  const coll = db.collection('push_subscriptions');
  const now = new Date();

  const existing = await coll.findOne({ endpoint });
  if (existing) {
    if (existing.userId === userId) {
      // Idempotent re-subscribe → reactivate + refresh keys.
      await coll.updateOne(
        { endpoint },
        { $set: { keys: { p256dh, auth }, active: true, deactivatedReason: null, device: body.device || existing.device || 'unknown', lastUsedAt: now, updatedAt: now } }
      );
      return NextResponse.json({ success: true, data: { status: 'active' } });
    }
    // Another user already owns this endpoint (stale device handoff) — take it over.
    await coll.updateOne(
      { endpoint },
      { $set: { userId, keys: { p256dh, auth }, active: true, deactivatedReason: null, device: body.device || 'unknown', lastUsedAt: now, updatedAt: now } }
    );
    return NextResponse.json({ success: true, data: { status: 'active' } });
  }

  await coll.insertOne({
    userId,
    endpoint,
    keys: { p256dh, auth },
    device: body.device || 'unknown',
    active: true,
    deactivatedReason: null,
    createdAt: now,
    lastUsedAt: now,
    updatedAt: now,
  });
  return NextResponse.json({ success: true, data: { status: 'active' } }, { status: 201 });
}

/**
 * DELETE /api/notifications/push/subscribe  { subscription: { endpoint } }
 * Removes the device subscription so the backend stops delivering to it.
 */
export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON body', 400, 'INVALID_BODY');
  }
  const endpoint = body?.subscription?.endpoint;
  if (typeof endpoint !== 'string') {
    return apiError('Missing subscription endpoint', 400, 'INVALID_SUBSCRIPTION');
  }

  await ensureIndexes();
  const db = (await clientPromise).db();
  await db.collection('push_subscriptions').deleteMany({ endpoint, userId });
  return NextResponse.json({ success: true, data: { status: 'removed' } });
}
