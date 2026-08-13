// Alerts/notifications observability (Phase 5 §45). Counters live in a
// dedicated Redis hash (hincrby-only) plus in-memory mirrors so the /status
// endpoint always reports honest numbers even when Redis is unavailable.

const redis = require('../../services/upstash');
const { NOTIFY_KEYS } = require('./types');

const memory = {
  workerStatus: 'stopped',
  workerStartedAt: null,
  lastRunAt: null,
  lastError: null,
};

async function setStatus(status) {
  memory.workerStatus = status;
  if (status === 'running' && !memory.workerStartedAt) memory.workerStartedAt = new Date();
}

async function incr(name, by = 1) {
  await redis.hincrby(NOTIFY_KEYS.counters, name, by);
  memory[`_${name}`] = (memory[`_${name}`] || 0) + by;
}

const markEventDetected = () => incr('eventsDetected');
const markAlertsEvaluated = (n) => incr('alertsEvaluated', n || 1);
const markAlertMatched = () => incr('alertsMatched');
const markQueued = () => incr('notificationsQueued');
const markSent = () => incr('notificationsSent');
const markFailed = () => incr('notificationsFailed');
const markSkipped = () => incr('notificationsSkipped');
const markDuplicatePrevented = () => incr('duplicatePrevented');
const markStaleEvent = () => incr('staleEvents');

async function addProviderLatency(ms) {
  await redis.hincrby(NOTIFY_KEYS.counters, 'providerLatencyMs', Math.round(ms));
  await redis.hincrby(NOTIFY_KEYS.counters, 'providerLatencyCount', 1);
}

async function snapshot() {
  return {
    workerStatus: memory.workerStatus,
    workerStartedAt: memory.workerStartedAt ? memory.workerStartedAt.toISOString() : null,
    lastError: memory.lastError || null,
    counters: {
      eventsDetected: memory._eventsDetected || 0,
      alertsEvaluated: memory._alertsEvaluated || 0,
      alertsMatched: memory._alertsMatched || 0,
      notificationsQueued: memory._notificationsQueued || 0,
      notificationsSent: memory._notificationsSent || 0,
      notificationsFailed: memory._notificationsFailed || 0,
      notificationsSkipped: memory._notificationsSkipped || 0,
      duplicatePrevented: memory._duplicatePrevented || 0,
      staleEvents: memory._staleEvents || 0,
    },
  };
}

module.exports = {
  memory,
  setStatus,
  markEventDetected,
  markAlertsEvaluated,
  markAlertMatched,
  markQueued,
  markSent,
  markFailed,
  markSkipped,
  markDuplicatePrevented,
  markStaleEvent,
  addProviderLatency,
  snapshot,
};
