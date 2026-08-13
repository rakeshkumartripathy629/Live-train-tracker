import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import clientPromise from '@/lib/mongodb';
import { getSessionUserId, ensureIndexes, apiError } from '@/lib/server';
import { mapAlertDoc, validateAlertInput } from '@/lib/alerts';
import { isRateLimited } from '@/lib/rate-limit';

function toObjectId(id: string) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function getAlert(db: any, userId: string, id: string) {
  const oid = toObjectId(id);
  if (!oid) return Promise.resolve(null);
  return db.collection('alerts').findOne({ _id: oid, userId });
}

/** PATCH /api/alerts/[id] → enable/disable or update the threshold. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  if (isRateLimited(`alerts:patch:${userId}`, 30)) {
    return apiError('Too many requests, try again shortly', 429, 'RATE_LIMITED');
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON body', 400, 'INVALID_BODY');
  }

  await ensureIndexes();
  const db = (await clientPromise).db();
  const alert = await getAlert(db, userId, params.id);
  if (!alert) return apiError('Alert not found', 404, 'NOT_FOUND');

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.enabled !== undefined) {
    update.enabled = Boolean(body.enabled);
  }
  if (body.threshold !== undefined) {
    const check = validateAlertInput({
      alertType: alert.alertType,
      journeyId: alert.journeyId,
      threshold: body.threshold,
      channel: alert.channel,
    });
    if (check) return apiError(check, 400, 'INVALID_ALERT');
    const num = Number(body.threshold);
    update.threshold = Number.isFinite(num) && num > 0 ? num : null;
  }

  const updated = await db
    .collection('alerts')
    .findOneAndUpdate({ _id: alert._id }, { $set: update }, { returnDocument: 'after' });
  return NextResponse.json({
    success: true,
    data: updated && updated.value ? mapAlertDoc(updated.value) : mapAlertDoc({ ...alert, ...update }),
  });
}

/** DELETE /api/alerts/[id] → remove the alert entirely. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  await ensureIndexes();
  const db = (await clientPromise).db();
  const alert = await getAlert(db, userId, params.id);
  if (!alert) return apiError('Alert not found', 404, 'NOT_FOUND');

  await db.collection('alerts').deleteOne({ _id: alert._id });
  return NextResponse.json({ success: true, data: { id: params.id } });
}
