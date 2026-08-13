// Tracking worker: Redis key layout, target states and helper fns.

const KEYS = {
  target: (targetId) => `tracking:target:${targetId}`,
  due: 'tracking:due',
  active: 'tracking:active',
  lock: (targetId) => `tracking:lock:${targetId}`,
  last: (targetId) => `tracking:last:${targetId}`,
  stats: 'tracking:stats', // scalars: lastRunAt, lastRunDurationMs, lastCycleStartAt
  counters: 'tracking:stats:counters', // hash counters, hincrby-only (never hset)
  lastCleanup: 'tracking:last-cleanup',
};

const TARGET_STATUS = {
  IDLE: 'IDLE',
  QUEUED: 'QUEUED',
  FETCHING: 'FETCHING',
  ACTIVE: 'ACTIVE',
  STALE: 'STALE',
  ERROR: 'ERROR',
  COMPLETED: 'COMPLETED',
};

const PRIORITY = {
  ACTIVE: 'active',
  PRESTART: 'prestart',
};

function targetIdOf(trainNumber, journeyDate) {
  return `${String(trainNumber).trim()}:${String(journeyDate).trim()}`;
}

function emptyTarget(trainNumber, journeyDate, priority, journeyId) {
  const now = new Date();
  const target = {
    targetId: targetIdOf(trainNumber, journeyDate),
    trainNumber: String(trainNumber),
    journeyDate: String(journeyDate),
    status: TARGET_STATUS.IDLE,
    priority,
    journeyIds: journeyId ? [String(journeyId)] : [],
    attempts: 0,
    lastError: null,
    lastFetchedAt: null,
    lastSnapshotAt: null,
    nextFetchAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  return target;
}

/**
 * Worker reschedule delay with exponential backoff.
 * Base interval grows 2^(attempts-1), hard-capped at 5 minutes.
 */
function backoffMs(attempts, baseMs) {
  const cappedBase = Math.max(1000, baseMs);
  return Math.min(300000, cappedBase * Math.pow(2, Math.max(0, attempts - 1)));
}

module.exports = {
  KEYS,
  TARGET_STATUS,
  PRIORITY,
  targetIdOf,
  emptyTarget,
  backoffMs,
};
