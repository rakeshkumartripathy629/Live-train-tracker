const config = require('../../config/env');
const redis = require('../../services/upstash');
const TrainSnapshot = require('../../models/TrainSnapshot');
const Journey = require('../../models/Journey');
const { KEYS, TARGET_STATUS, targetIdOf, emptyTarget } = require('./types');
const { isStrongCompletionEvidence } = require('./normalizer');
const metrics = require('./metrics');

const TARGET_TTL_SECONDS = 24 * 3600;

async function saveTarget(target) {
  target.updatedAt = new Date().toISOString();
  await redis.set(KEYS.target(target.targetId), target, TARGET_TTL_SECONDS);
}

async function loadTarget(targetId) {
  const t = await redis.get(KEYS.target(targetId));
  return t || null;
}

/**
 * Ensure a tracking target exists for (trainNumber, journeyDate). If it already
 * exists the existing state is kept (never resets failures or schedules a new
 * due time); otherwise a new target is created, scheduled due immediately and
 * added to the active set.
 */
async function ensureTarget({ trainNumber, journeyDate, priority, journeyId }) {
  const targetId = targetIdOf(trainNumber, journeyDate);
  let target = await loadTarget(targetId);
  if (!target) {
    target = emptyTarget(trainNumber, journeyDate, priority, journeyId);
    target.status = TARGET_STATUS.QUEUED;
    target.nextFetchAt = Date.now();
    await saveTarget(target);
    await redis.sadd(KEYS.active, targetId);
  } else {
    if (journeyId && !target.journeyIds.includes(String(journeyId))) {
      target.journeyIds.push(String(journeyId));
      await saveTarget(target);
    }
    if (priority === 'active' && target.priority !== 'active') {
      target.priority = priority;
      await saveTarget(target);
    }
    await redis.sadd(KEYS.active, targetId);
  }
  return target;
}

/**
 * Schedule the target in the due queue. Idempotent: if a due time already
 * exists it is kept (ZADD only when there is no score, or the new time is
 * sooner). This prevents duplicate queue entries (spec §26).
 */
async function schedule(target, nextFetchAt = Date.now()) {
  if (!target || target.status === TARGET_STATUS.COMPLETED) return;
  const existing = await redis.zscore(KEYS.due, target.targetId);
  if (existing !== null && existing <= nextFetchAt) return;
  target.nextFetchAt = nextFetchAt;
  await redis.zadd(KEYS.due, nextFetchAt, target.targetId);
  await saveTarget(target);
}

async function setTargetStatus(target, status, extra = {}) {
  target.status = status;
  Object.assign(target, extra);
  await saveTarget(target);
}

async function markCompleted(target, { journeyIds = [] } = {}) {
  target.status = TARGET_STATUS.COMPLETED;
  target.nextFetchAt = null;
  await saveTarget(target);
  await redis.zrem(KEYS.due, target.targetId);
  await redis.srem(KEYS.active, target.targetId);
  await redis.del(KEYS.last(target.targetId));
  if (journeyIds.length > 0) {
    await Journey.updateMany({ _id: { $in: journeyIds } }, { $set: { lastTrackedAt: new Date() } });
  }
}

/**
 * Persist one snapshot. The unique dedupKey index guarantees no duplicate row;
 * a duplicate-key write is swallowed and counted as dedupPrevented. Returns the
 * new row's _id when a snapshot was actually written (needed by the Phase 5
 * alert pipeline to find the previous observation).
 */
async function persistSnapshot(snapshot) {
  try {
    const created = await TrainSnapshot.create(snapshot);
    await metrics.markSnapshotWritten();
    return { written: true, snapshotId: created._id };
  } catch (err) {
    if (err && err.code === 11000) {
      await metrics.markDedupPrevented();
      return { written: false, deduped: true };
    }
    throw err;
  }
}

/**
 * Update the journey(s) attached to a target: refresh lastTrackedAt and, only
 * on strong evidence, auto-complete (spec §19). Never touches user data.
 */
async function applyToJourneys(target, snapshot) {
  const journeyFilter = {
    trainNumber: target.trainNumber,
    journeyDate: target.journeyDate,
    status: 'ACTIVE',
  };
  const journeys = await Journey.find(journeyFilter).select({ _id: 1, destinationStationCode: 1 }).limit(50);

  if (journeys.length === 0) return;

  for (const journey of journeys) {
    const complete = isStrongCompletionEvidence(snapshot, journey.destinationStationCode);
    if (complete) {
      await Journey.updateOne(
        { _id: journey._id, status: 'ACTIVE' },
        { $set: { status: 'COMPLETED', completedAt: new Date(), lastTrackedAt: new Date() } }
      );
      await metrics.markJourneyCompleted();
    } else {
      await Journey.updateOne(
        { _id: journey._id, status: 'ACTIVE' },
        { $set: { lastTrackedAt: new Date() } }
      );
    }
  }
}

module.exports = {
  saveTarget,
  loadTarget,
  ensureTarget,
  schedule,
  setTargetStatus,
  markCompleted,
  persistSnapshot,
  applyToJourneys,
  TARGET_TTL_SECONDS,
};
