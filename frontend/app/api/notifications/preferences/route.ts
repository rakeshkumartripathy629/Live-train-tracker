import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getSessionUserId, ensureIndexes, apiError } from '@/lib/server';
import { isRateLimited } from '@/lib/rate-limit';

/**
 * GET /api/notifications/preferences
 * Reports the user's push-device state. `enabled` is true only when at least
 * one active subscription exists — the backend worker delivers to exactly
 * those, so this is never a fictional toggle.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  await ensureIndexes();
  const db = (await clientPromise).db();
  const subs = await db
    .collection('push_subscriptions')
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  const devices = subs.map((s: any) => ({
    id: s._id.toString(),
    device: s.device || 'unknown',
    active: s.active !== false,
    deactivatedReason: s.deactivatedReason || null,
    createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
    lastUsedAt: s.lastUsedAt ? new Date(s.lastUsedAt).toISOString() : null,
  }));

  return NextResponse.json({
    success: true,
    data: {
      push: {
        configured: true,
        enabled: devices.some((d: any) => d.active),
        devices,
      },
      channels: ['PUSH'],
    },
  });
}

/**
 * POST /api/notifications/preferences { enabled: false } deactivates every
 * device subscription (the only real way to stop delivery). Setting enabled
 * back to true requires the browser to re-subscribe (PushToggle flow) — a
 * server cannot create a subscription it never saw.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  if (isRateLimited(`notif:prefs:${userId}`, 10)) {
    return apiError('Too many requests, try again shortly', 429, 'RATE_LIMITED');
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON body', 400, 'INVALID_BODY');
  }

  if (body?.enabled === false) {
    await ensureIndexes();
    const db = (await clientPromise).db();
    await db
      .collection('push_subscriptions')
      .updateMany(
        { userId, active: true },
        { $set: { active: false, deactivatedReason: 'user-disabled', updatedAt: new Date() } }
      );
    return NextResponse.json({ success: true, data: { push: { enabled: false } } });
  }

  return apiError('Re-enabling push requires subscribing from a device (PushToggle)', 400, 'RE_SUBSCRIBE_REQUIRED');
}
