// Station observations (Phase 8 §29–§33). PURE derivation of real station
// events from the tracking worker's REAL snapshots (prev vs current), plus a
// Mongo ingest with a unique dedupe key. Nothing here invents data:
//   - events are only the transitions the real status/station fields support
//   - delayMinutes / platform are copied verbatim from the source snapshot
//   - first observation (prev = null) records only a positional AT_STATION
//     when the train is actually at a station — never an arrival/departure
//     (those need a real transition).

const { StationObservation } = require('../../models/StationObservation');
const { dedupBucketMs } = require('../train-tracking/normalizer');
const config = require('../../config/env');

function safeStr(v) {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function eventTypeForStatus(status) {
  if (status === 'AT_STATION' || status === 'ARRIVED') return 'AT_STATION';
  return null;
}

function sameStation(a, b) {
  return String(a || '').toUpperCase() === String(b || '').toUpperCase();
}

function observationDoc(prev, current, stationCode, stationName, eventType) {
  if (!current || !stationCode) return null;
  const bucketMs = dedupBucketMs(
    current.observedAt ? current.observedAt.getTime() : Date.now(),
    config.tracking.intervalSeconds * 1000
  );
  const observedAt = current.observedAt instanceof Date ? current.observedAt : new Date(current.observedAt);
  return {
    dedupKey: `obs:${current.trainNumber}:${current.journeyDate}:${stationCode.toUpperCase()}:${eventType}:${bucketMs}`,
    trainNumber: current.trainNumber,
    trainName: current.trainName || null,
    journeyDate: current.journeyDate,
    stationCode: stationCode.toUpperCase(),
    stationName: stationName || null,
    eventType,
    status: current.status || null,
    delayMinutes: typeof current.delayMinutes === 'number' && Number.isFinite(current.delayMinutes)
      ? current.delayMinutes
      : null,
    platform: current.platform || null,
    observedAt,
    fetchedAt: current.fetchedAt instanceof Date ? current.fetchedAt : new Date(current.fetchedAt || Date.now()),
    dataQuality: current.dataQuality || 'PARTIAL',
    source: 'RAILRADAR',
  };
}

/**
 * Derive real station events by comparing the previous real snapshot against
 * the current one. `prev` may be null (first observation). Returns an array of
 * observation documents (without _id).
 */
function deriveStationObservations(prev, current) {
  if (!current || !current.trainNumber) return [];
  const events = [];

  const currCode = safeStr(current.currentStationCode);
  const currName = safeStr(current.currentStationName) || null;
  const prevCode = prev ? safeStr(prev.currentStationCode) : null;
  const prevStatus = prev ? prev.status : null;
  const currStatus = current.status;

  if (!currCode) return [];

  // ─── Departure: real transition out of a station ──────────────────────
  // prev AT_STATION/ARRIVED at A, now running/left at B → the train left A.
  if (prev && prevCode && !sameStation(prevCode, currCode)) {
    if ((prevStatus === 'AT_STATION' || prevStatus === 'ARRIVED') &&
        (currStatus === 'RUNNING' || currStatus === 'DEPARTED')) {
      const doc = observationDoc(prev, current, prevCode, safeStr(prev.currentStationName) || null, 'DEPARTED');
      if (doc) events.push(doc);
    }
  }
  // Source says DEPARTED (currentLocation.status 'left-station') → the train
  // just left the CURRENT station.
  if (currStatus === 'DEPARTED') {
    const doc = observationDoc(prev, current, currCode, currName, 'DEPARTED');
    if (doc) events.push(doc);
  }

  // ─── Arrival: real transition into a station ──────────────────────────
  // Running/left at A, now at-station/arrived at B → arrival at B.
  if (prev && prevCode && !sameStation(prevCode, currCode)) {
    if ((prevStatus === 'RUNNING' || prevStatus === 'DEPARTED' || prevStatus === 'AT_STATION' || prevStatus === 'ARRIVED') &&
        (currStatus === 'AT_STATION' || currStatus === 'ARRIVED')) {
      const doc = observationDoc(prev, current, currCode, currName, 'ARRIVED');
      if (doc) events.push(doc);
    }
  }

  // ─── Positional: the train is currently AT the station ────────────────
  const pos = eventTypeForStatus(currStatus);
  if (pos) {
    const doc = observationDoc(prev, current, currCode, currName, pos);
    if (doc) events.push(doc);
  }

  // De-duplicate within one derivation (same station + event twice).
  const seen = new Set();
  return events.filter((e) => {
    const k = `${e.stationCode}:${e.eventType}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Persist derived observations. Ordered insertMany + unique dedupe index means
 * repeated delivery of the SAME observation is a no-op; only genuinely new
 * events write rows. Never throws for duplicate rows.
 */
async function ingestStationObservations(prev, current) {
  if (!config.stations.enabled) return { derived: 0, inserted: 0 };
  const derived = deriveStationObservations(prev, current);
  if (derived.length === 0) return { derived: 0, inserted: 0 };
  try {
    const result = await StationObservation.insertMany(derived, { ordered: false });
    return { derived: derived.length, inserted: Array.isArray(result) ? result.length : 0 };
  } catch (err) {
    if (err && err.code === 11000) {
      const inserted = err.insertedDocs ? err.insertedDocs.length : 0;
      return { derived: derived.length, inserted, deduped: true };
    }
    if (err && err.name === 'BulkWriteError') {
      const inserted = (err.result && err.result.nInserted) || 0;
      return { derived: derived.length, inserted, deduped: true };
    }
    throw err;
  }
}

module.exports = {
  deriveStationObservations,
  ingestStationObservations,
  EVENT_TYPES: ['AT_STATION', 'ARRIVED', 'DEPARTED'],
};
