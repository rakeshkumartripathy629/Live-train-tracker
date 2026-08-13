// Alert / notification engine (Phase 5): event types, Redis key layout and
// shared constants.

const NOTIFY_KEYS = {
  due: 'notify:due', // zset, score = next retry epoch ms
  job: (id) => `notify:job:${id}`, // job JSON payload
  lock: (id) => `notify:lock:${id}`,
  dedupe: (key) => `notify:dedupe:${key}`,
  stale: (targetId) => `alerts:stale:${targetId}`, // stale-episode flag per target
  stats: 'alerts:stats', // scalars
  counters: 'alerts:stats:counters', // hash counters (hincrby-only)
};

// Detected, real-data-only event types (Phase 5 §4).
// Events that cannot be derived from the real RailRadar payload are NOT listed:
//   - ETA_CHANGED          — the provider exposes no ETA field (only fixed
//                            scheduled times + delay); computing one would be
//                            estimation, which is forbidden (§11, §4).
//   - TRAIN_APPROACHING    — requires real train coordinates; RailRadar live
//                            sends no lat/lng (§8). Never estimated.
const EVENT_TYPES = [
  'TRAIN_STARTED',
  'TRAIN_DEPARTED',
  'TRAIN_ARRIVED',
  'DELAY_STARTED',
  'DELAY_INCREASED',
  'DELAY_REDUCED',
  'DESTINATION_APPROACHING',
  'JOURNEY_COMPLETED',
  'TRAIN_CANCELLED',
  'TRAIN_DIVERTED',
  'LIVE_DATA_STALE',
  'LIVE_DATA_RECOVERED',
];

// Event types a user can subscribe to via an alert (subset of EVENT_TYPES the
// engine can actually evaluate). Exposed alert types mirror these 1:1.
const ALERTABLE_EVENTS = [
  'TRAIN_STARTED',
  'TRAIN_DEPARTED',
  'TRAIN_ARRIVED',
  'DESTINATION_APPROACHING',
  'JOURNEY_COMPLETED',
  'TRAIN_CANCELLED',
  'TRAIN_DIVERTED',
  'LIVE_DATA_STALE',
];

// alertType -> event types it reacts to.
const ALERT_TYPE_EVENTS = {
  DELAY_THRESHOLD: ['DELAY_STARTED', 'DELAY_INCREASED'],
  DELAY_INCREASE: ['DELAY_STARTED', 'DELAY_INCREASED'],
  DELAY_REDUCTION: ['DELAY_REDUCED'],
  TRAIN_STARTED: ['TRAIN_STARTED'],
  TRAIN_DEPARTED: ['TRAIN_DEPARTED'],
  TRAIN_ARRIVED: ['TRAIN_ARRIVED'],
  DESTINATION_APPROACHING: ['DESTINATION_APPROACHING'],
  JOURNEY_COMPLETED: ['JOURNEY_COMPLETED'],
  TRAIN_CANCELLED: ['TRAIN_CANCELLED'],
  TRAIN_DIVERTED: ['TRAIN_DIVERTED'],
  LIVE_DATA_STALE: ['LIVE_DATA_STALE'],
};

// LIVE_DATA_STALE / LIVE_DATA_RECOVERED are evaluated per target (no journey
// is required). The rest always belong to a journey.
const TARGET_LEVEL_EVENTS = ['LIVE_DATA_STALE', 'LIVE_DATA_RECOVERED'];

/**
 * Deterministic notification dedupe key. The observation bucket (aligned to the
 * snapshot interval) makes it stable across a repeated delivery of the SAME
 * observation, while transitions only fire once so a new observation bucket does
 * not duplicate a genuine event. Enforced in Redis (SETNX + TTL) and MongoDB
 * (unique sparse index) — safe across multiple worker instances (§24).
 */
function notificationDedupeKey({ trainNumber, journeyId, eventType, stationCode, observedAtMs, extra = '' }) {
  const bucket = Math.floor((observedAtMs || Date.now()) / (60 * 1000));
  const parts = [
    String(trainNumber || ''),
    String(journeyId || ''),
    eventType,
    String(stationCode || 'GLOBAL'),
    String(bucket),
    String(extra),
  ].filter(Boolean);
  return parts.join(':');
}

module.exports = {
  NOTIFY_KEYS,
  EVENT_TYPES,
  ALERTABLE_EVENTS,
  ALERT_TYPE_EVENTS,
  TARGET_LEVEL_EVENTS,
  notificationDedupeKey,
};
