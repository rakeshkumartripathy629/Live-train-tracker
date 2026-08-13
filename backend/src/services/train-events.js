// Train event publisher (Phase 7): turns genuinely-new tracking snapshots into
// real-time SSE payloads on the in-process event bus. Nothing here invents
// data — every field comes from the normalized real snapshot (TrainSnapshot),
// and change-specific events fire only when a real value changed.

const { publish } = require('./event-bus');

const SSE_EVENT_NAMES = {
  TRAIN_UPDATE: 'train-update',
  TRAIN_STATUS_CHANGED: 'train-status-changed',
  TRAIN_DELAY_CHANGED: 'train-delay-changed',
  TRAIN_STATION_CHANGED: 'train-station-changed',
  TRAIN_ETA_CHANGED: 'train-eta-changed',
  JOURNEY_COMPLETED: 'journey-completed',
  TRACKING_STALE: 'tracking-stale',
  TRACKING_RECOVERED: 'tracking-recovered',
};

function topicOf(trainNumber, journeyDate) {
  return `train:updates:${String(trainNumber).trim()}:${String(journeyDate).trim()}`;
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Build the wire payload from a real snapshot. Only §6 real fields are sent;
 * nulls stay null so the frontend never invents values.
 */
function eventPayload(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return {
    type: 'TRAIN_UPDATE',
    trainNumber: snapshot.trainNumber || null,
    journeyDate: snapshot.journeyDate || null,
    observedAt: toIso(snapshot.observedAt),
    status: snapshot.status || null,
    delayMinutes: typeof snapshot.delayMinutes === 'number' ? snapshot.delayMinutes : null,
    currentStation: snapshot.currentStationCode
      ? { code: snapshot.currentStationCode, name: snapshot.currentStationName || null }
      : null,
    nextStation: snapshot.nextStationCode
      ? { code: snapshot.nextStationCode, name: snapshot.nextStationName || null }
      : null,
    previousStationCode: snapshot.previousStationCode || null,
    speedKmh: typeof snapshot.speedKmh === 'number' ? snapshot.speedKmh : null,
    latitude: typeof snapshot.latitude === 'number' ? snapshot.latitude : null,
    longitude: typeof snapshot.longitude === 'number' ? snapshot.longitude : null,
    platform: snapshot.platform || null,
    completionFraction: typeof snapshot.completionFraction === 'number' ? snapshot.completionFraction : null,
    dataQuality: snapshot.dataQuality || 'PARTIAL',
    source: 'RAILRADAR',
  };
}

/**
 * Publish the full TRAIN_UPDATE for a genuinely-new snapshot, plus focused
 * change events for fields that actually moved (compared to the previous
 * real snapshot). `prev` may be null (first observation) — then only the
 * full update is published.
 */
function publishSnapshot(target, snapshot, prev) {
  if (!snapshot || !snapshot.trainNumber) return 0;
  const topic = topicOf(target.trainNumber, target.journeyDate);
  const base = eventPayload(snapshot);
  let sent = publish(topic, base);

  if (!prev) return sent;

  if (prev.status !== snapshot.status && snapshot.status) {
    sent += publish(topic, { ...base, type: 'TRAIN_STATUS_CHANGED', previousStatus: prev.status || null });
  }
  if (prev.delayMinutes !== snapshot.delayMinutes && typeof snapshot.delayMinutes === 'number') {
    sent += publish(topic, { ...base, type: 'TRAIN_DELAY_CHANGED', previousDelayMinutes: prev.delayMinutes ?? null });
  }
  if (prev.currentStationCode !== snapshot.currentStationCode && snapshot.currentStationCode) {
    sent += publish(topic, { ...base, type: 'TRAIN_STATION_CHANGED' });
  }
  if (
    snapshot.status === 'COMPLETED' ||
    snapshot.status === 'ARRIVED'
  ) {
    sent += publish(topic, { ...base, type: 'JOURNEY_COMPLETED' });
  }
  return sent;
}

/**
 * Tracking-health events: fired only on a real status transition so they are
 * never repeated for the same condition (worker guards the transition).
 */
function publishTrackingState(target, state) {
  if (!SSE_EVENT_NAMES[state]) return 0;
  const topic = topicOf(target.trainNumber, target.journeyDate);
  return publish(topic, {
    type: state,
    trainNumber: target.trainNumber,
    journeyDate: target.journeyDate,
    observedAt: new Date().toISOString(),
    lastSuccessfulFetch: toIso(target.lastSnapshotAt),
    dataQuality: 'PARTIAL',
  });
}

module.exports = {
  SSE_EVENT_NAMES,
  topicOf,
  eventPayload,
  publishSnapshot,
  publishTrackingState,
};
