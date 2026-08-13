import { ObjectId } from 'mongodb';

export const JOURNEY_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

export class JourneyError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'BAD_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function toId(id: string): ObjectId | null {
  if (!ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}

export function mapJourneyDoc(doc: any) {
  return {
    id: doc._id.toString(),
    trainNumber: doc.trainNumber,
    trainName: doc.trainName || '',
    origin: doc.origin || { code: '', name: '' },
    destination: doc.destination || { code: '', name: '' },
    boardingStationCode: doc.boardingStationCode,
    boardingStationName: doc.boardingStationName || doc.boardingStationCode,
    destinationStationCode: doc.destinationStationCode,
    destinationStationName: doc.destinationStationName || doc.destinationStationCode,
    journeyDate: doc.journeyDate,
    status: doc.status,
    startedAt: doc.startedAt || null,
    completedAt: doc.completedAt || null,
    lastTrackedAt: doc.lastTrackedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function getOwnedJourney(db: any, userId: string, id: string) {
  const oid = toId(id);
  if (!oid) return null;
  return db.collection('journeys').findOne({ _id: oid, userId });
}

export type Action = 'START' | 'COMPLETE' | 'CANCEL';

/**
 * Ownership-scoped action runner for the /api/journeys/[id]/* routes.
 * Returns the updated journey doc or throws JourneyError.
 */
export async function runAction(db: any, userId: string, id: string, action: Action) {
  const journey = await getOwnedJourney(db, userId, id);
  if (!journey) throw new JourneyError('Journey not found', 404, 'NOT_FOUND');
  return applyTransition(db, journey, action);
}

/**
 * Apply a user-authorized status transition. The journey document must already
 * be scoped to the session userId by the caller — ownership is never derived
 * from the request.
 */
export async function applyTransition(db: any, journey: any, action: Action) {
  const now = new Date();
  const current: JourneyStatus = journey.status;
  const updates: Record<string, unknown> = { updatedAt: now };

  if (action === 'START') {
    if (current !== 'PLANNED') {
      throw new JourneyError(
        `Only a PLANNED journey can be started (current: ${current})`,
        409,
        'INVALID_STATUS'
      );
    }
    updates.status = 'ACTIVE';
    updates.startedAt = now;
  } else if (action === 'COMPLETE') {
    if (current !== 'ACTIVE') {
      throw new JourneyError(
        `Only an ACTIVE journey can be completed (current: ${current})`,
        409,
        'INVALID_STATUS'
      );
    }
    updates.status = 'COMPLETED';
    updates.completedAt = now;
  } else if (action === 'CANCEL') {
    if (current === 'COMPLETED') {
      throw new JourneyError('A COMPLETED journey cannot be cancelled', 409, 'INVALID_STATUS');
    }
    updates.status = 'CANCELLED';
  } else {
    throw new JourneyError('Unknown action', 400, 'INVALID_ACTION');
  }

  const updated = await db
    .collection('journeys')
    .findOneAndUpdate(
      { _id: journey._id },
      { $set: updates },
      { returnDocument: 'after' }
    );
  if (!updated) {
    throw new JourneyError('Journey not found', 404, 'NOT_FOUND');
  }
  return mapJourneyDoc(updated);
}
