// Station event publisher (Phase 8 §42). Turns genuinely-new station
// observations (derived from real snapshots by station-observations.js) into
// real-time SSE payloads on the in-process event bus, keyed per station.
//
// The SAME real observations feed the Phase 5 alert engine and this stream, so
// a station subscriber sees exactly the events the alert engine reacts to —
// this is the Phase 8 "alerts integration" surface (no duplicated logic, no
// fabricated data).
//
// A best-effort "last event per station" is kept in Redis for the stream's
// initial state and cross-instance reconcile.

const { publish } = require('./event-bus');
const redis = require('./upstash');
const { deriveStationObservations } = require('../workers/stations/station-observations');

const STATION_EVENT_NAMES = {
  STATION_TRAIN_UPDATE: 'station-train-update',
  STATION_TRAIN_ARRIVED: 'station-train-arrived',
  STATION_TRAIN_DEPARTED: 'station-train-departed',
  STATION_TRAIN_AT_STATION: 'station-train-at-station',
};

const STATION_TOPIC = (code) => `station:updates:${String(code || '').toUpperCase()}`;
const STATION_LAST_KEY = (code) => `station:last:${String(code || '').toUpperCase()}`;
const STATION_LAST_TTL_SECONDS = 24 * 3600;

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Build the wire payload from a real observation. Only real fields are sent;
 * nulls stay null.
 */
function stationEventPayload(obs) {
  if (!obs || !obs.stationCode) return null;
  const typeMap = {
    ARRIVED: 'STATION_TRAIN_ARRIVED',
    DEPARTED: 'STATION_TRAIN_DEPARTED',
    AT_STATION: 'STATION_TRAIN_AT_STATION',
  };
  const type = typeMap[obs.eventType]
    ? STATION_EVENT_NAMES[typeMap[obs.eventType]]
    : STATION_EVENT_NAMES.STATION_TRAIN_UPDATE;
  return {
    type,
    trainNumber: obs.trainNumber || null,
    trainName: obs.trainName || null,
    journeyDate: obs.journeyDate || null,
    eventType: obs.eventType || null,
    station: { code: obs.stationCode.toUpperCase(), name: obs.stationName || null },
    status: obs.status || null,
    delayMinutes: typeof obs.delayMinutes === 'number' ? obs.delayMinutes : null,
    platform: obs.platform || null,
    observedAt: toIso(obs.observedAt),
    dataQuality: obs.dataQuality || 'PARTIAL',
    source: 'RAILRADAR',
  };
}

/**
 * Publish station events derived from the (prev, current) real snapshots.
 * Returns the number of events published.
 */
async function publishStationEvents(prev, current) {
  const derived = deriveStationObservations(prev, current);
  let sent = 0;
  for (const obs of derived) {
    const payload = stationEventPayload(obs);
    if (!payload) continue;
    const topic = STATION_TOPIC(obs.stationCode);
    sent += publish(topic, payload);
    try {
      await redis.set(STATION_LAST_KEY(obs.stationCode), payload, STATION_LAST_TTL_SECONDS);
    } catch {
      // last-event cache is best-effort
    }
  }
  return sent;
}

module.exports = {
  STATION_EVENT_NAMES,
  STATION_TOPIC,
  STATION_LAST_KEY,
  STATION_LAST_TTL_SECONDS,
  stationEventPayload,
  publishStationEvents,
};
