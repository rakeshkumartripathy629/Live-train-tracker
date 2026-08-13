const redis = require('../../services/upstash');
const { KEYS } = require('./types');

// In-memory + Redis metrics for the tracking worker (spec §34).
// Redis counters survive restarts and are shared across instances; the memory
// copy keeps the last-cycle latency values available even if Redis is down.

const memory = {
  workerStatus: 'stopped',
  workerStartedAt: null,
  workerUptimeMs: 0,
  lastRunAt: null,
  lastRunDurationMs: null,
  lastError: null,
  lastCycleLatencyMs: null,
};

const COUNTERS = {
  runCycles: 'runCycles',
  successes: 'successes',
  failures: 'failures',
  rateLimited: 'rateLimited',
  timeouts: 'timeouts',
  snapshotsWritten: 'snapshotsWritten',
  dedupPrevented: 'dedupPrevented',
  journeysCompleted: 'journeysCompleted',
  targetsDiscovered: 'targetsDiscovered',
  latenciesMs: 'latenciesMs',
  latencyCount: 'latencyCount',
  cleanupRuns: 'cleanupRuns',
  snapshotsPurged: 'snapshotsPurged',
};

async function setStatus(status) {
  memory.workerStatus = status;
  if (status === 'running') {
    if (!memory.workerStartedAt) memory.workerStartedAt = new Date();
    await redis.set('tracking:worker-status', status, 3600);
  }
}

async function startCycle() {
  memory.lastCycleStart = Date.now();
  await redis.hset(KEYS.stats, 'lastCycleStartAt', Date.now());
  return memory.lastCycleStart;
}

async function endCycle(startMs) {
  memory.lastRunAt = new Date();
  memory.lastRunDurationMs = Date.now() - startMs;
  memory.lastCycleLatencyMs = memory.lastRunDurationMs;
  memory.workerUptimeMs = memory.workerStartedAt ? Date.now() - memory.workerStartedAt.getTime() : 0;
  await redis.hset(KEYS.stats, 'lastRunAt', Date.now());
  await redis.hset(KEYS.stats, 'lastRunDurationMs', memory.lastRunDurationMs);
  await incr('runCycles');
}

async function incr(name, by = 1) {
  // Counters live in a dedicated hash and are incremented with hincrby so they
  // never collide with the scalar stats hash (mixed types would WRONGTYPE).
  await redis.hincrby(KEYS.counters, name, by);
  memory[`_${name}`] = (memory[`_${name}`] || 0) + by;
}

async function addLatency(ms) {
  await redis.hincrby(KEYS.counters, 'latenciesMs', Math.round(ms));
  await redis.hincrby(KEYS.counters, 'latencyCount', 1);
}

async function markSuccess() {
  await incr('successes');
}

async function markFailure() {
  await incr('failures');
}

async function markRateLimited() {
  await incr('rateLimited');
}

async function markTimeout() {
  await incr('timeouts');
}

async function markSnapshotWritten() {
  await incr('snapshotsWritten');
}

async function markDedupPrevented() {
  await incr('dedupPrevented');
}

async function markJourneyCompleted() {
  await incr('journeysCompleted');
}

async function markTargetsDiscovered(n) {
  await incr('targetsDiscovered', n);
}

async function markCleanup(removed) {
  await incr('cleanupRuns');
  await incr('snapshotsPurged', removed);
}

async function snapshot() {
  const activeTargets = await redis.scard(KEYS.active).catch(() => 0);
  return {
    workerStatus: memory.workerStatus,
    workerStartedAt: memory.workerStartedAt ? memory.workerStartedAt.toISOString() : null,
    workerUptimeMs: memory.workerUptimeMs,
    lastRunAt: memory.lastRunAt ? memory.lastRunAt.toISOString() : null,
    lastRunDurationMs: memory.lastRunDurationMs,
    lastError: memory.lastError || null,
    activeTargets,
    counters: {
      runCycles: memory._runCycles || 0,
      successes: memory._successes || 0,
      failures: memory._failures || 0,
      rateLimited: memory._rateLimited || 0,
      timeouts: memory._timeouts || 0,
      snapshotsWritten: memory._snapshotsWritten || 0,
      dedupPrevented: memory._dedupPrevented || 0,
      journeysCompleted: memory._journeysCompleted || 0,
      targetsDiscovered: memory._targetsDiscovered || 0,
    },
  };
}

module.exports = {
  memory,
  COUNTERS,
  setStatus,
  startCycle,
  endCycle,
  addLatency,
  markSuccess,
  markFailure,
  markRateLimited,
  markTimeout,
  markSnapshotWritten,
  markDedupPrevented,
  markJourneyCompleted,
  markTargetsDiscovered,
  markCleanup,
  snapshot,
};
