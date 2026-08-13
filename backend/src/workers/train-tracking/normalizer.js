// Strict snapshot normalizer for the live train tracking worker.
//
// Contracts (Phase 4 spec §12, §21, §22):
//  1. ONLY fields actually provided by RailRadar are stored. Missing values are
//     `null` — never 0, "Unknown", or fabricated placeholders.
//  2. NEVER interpolate or estimate. No fabricated lat/lng (we do NOT copy
//     station coordinates onto the train), no speed estimates, no ETA math.
//     Speed/lat/lng are only taken from `currentLocation` if the source sends them.
//  3. delayMinutes is copied verbatim (0 is a real value from the source).
//  4. observedAt is preserved exactly as the source's observation time
//     (`lastUpdatedAt`); fetchedAt is when we actually polled.
//  5. completionFraction / covered / remaining distances are computed ONLY from
//     the real scheduled stop `distance` values and the actual current stop —
//     aggregation of real data, never estimation.

const config = require('../../config/env');

const STATUS_MAP = {
  'not-started': 'NOT_STARTED',
  running: 'RUNNING',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
  diverted: 'DIVERTED',
};

const CURRENT_LOCATION_STATUS = {
  'at-station': 'AT_STATION',
  'left-station': 'DEPARTED',
  departed: 'DEPARTED',
  left: 'DEPARTED',
  arrived: 'ARRIVED',
  running: 'RUNNING',
};

const LOCATION_STATES = new Set(['passed', 'departed', 'left', 'at-station', 'arrived', 'left-station']);

function safeNum(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function safeStr(v) {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function normalizeStatus(rawStatus, currentStatus) {
  const train = STATUS_MAP[String(rawStatus || '').toLowerCase()];
  if (train === 'COMPLETED' || train === 'CANCELLED' || train === 'NOT_STARTED' || train === 'DIVERTED') {
    return train;
  }
  if (currentStatus) {
    const loc = CURRENT_LOCATION_STATUS[String(currentStatus).toLowerCase()];
    if (loc) return loc;
  }
  return train || 'UNKNOWN';
}

function findStop(route, stationCode) {
  if (!Array.isArray(route)) return null;
  return route.find((s) => String(s.stationCode || '').toUpperCase() === String(stationCode || '').toUpperCase()) || null;
}

/**
 * Compute the furthest point the train has reached along the route using the
 * real stop statuses (passed/at-station/arrived/departed). Returns:
 * { sequence, stationCode, stationName, status, platform, distance }
 * or null when there is no evidence of progress.
 */
function currentStopEvidence(route, currentLocation) {
  if (!Array.isArray(route)) return null;
  if (currentLocation) {
    const stop = findStop(route, currentLocation.stationCode);
    if (stop) return stop;
  }
  let best = null;
  for (const stop of route) {
    if (stop && LOCATION_STATES.has(String(stop.status || '').toLowerCase())) {
      best = stop;
    }
  }
  return best;
}

function distanceTotals(route) {
  if (!Array.isArray(route) || route.length === 0) return null;
  let max = -1;
  for (const stop of route) {
    const d = safeNum(stop.distance);
    if (d !== null && d > max) max = d;
  }
  return max >= 0 ? max : null;
}

function computeProgress(route, evidence) {
  const total = distanceTotals(route);
  if (total === null) return { totalDistanceKm: null, coveredDistanceKm: null, remainingDistanceKm: null, completionFraction: null };
  const ev = evidence && safeNum(evidence.distance);
  const covered = ev !== null ? Math.max(0, ev) : 0;
  const fraction = total > 0 ? Math.min(1, covered / total) : 0;
  return {
    totalDistanceKm: total,
    coveredDistanceKm: covered,
    remainingDistanceKm: Math.max(0, total - covered),
    completionFraction: Number(fraction.toFixed(4)),
  };
}

function parseObservationTime(lastUpdatedAt, fallback) {
  if (typeof lastUpdatedAt === 'string' && lastUpdatedAt.trim()) {
    const t = Date.parse(lastUpdatedAt);
    if (Number.isFinite(t)) return new Date(t);
  }
  return fallback;
}

function qualityOf(observedAt, fetchedAt, evidence, currentLocation) {
  if (!observedAt || !fetchedAt) return 'PARTIAL';
  const ageMin = (fetchedAt.getTime() - observedAt.getTime()) / 60000;
  if (ageMin > 15) return 'STALE';
  if (!evidence && !currentLocation) return 'PARTIAL';
  return 'LIVE';
}

/**
 * Build the observation bucket (ms) for the dedup key from the source
 * observation time, aligned to the tracking interval.
 */
function dedupBucketMs(observedAtMs, intervalMs = config.tracking.intervalSeconds * 1000) {
  const step = Math.max(1000, intervalMs);
  return Math.floor(observedAtMs / step) * step;
}

/**
 * Deterministic dedup key: one snapshot per (train, journeyDate, time-bucket,
 * status, current station). The unique index on this key is the last line of
 * defence against duplicate rows (spec §16).
 */
function computeDedupKey(trainNumber, journeyDate, observedAtMs, status, currentStationCode, intervalMs) {
  const bucket = dedupBucketMs(observedAtMs, intervalMs);
  return `${trainNumber}:${journeyDate}:${bucket}:${status}:${currentStationCode || 'UNKNOWN'}`;
}

function parseJourneyDate(startDate, fallback) {
  if (typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(startDate)) {
    return startDate.slice(0, 10);
  }
  return fallback;
}

/**
 * Strict normalizer. `raw` is the RailRadar GET /trains/:num/live payload
 * (`data` object), `ctx` carries { trainNumber, journeyDate } for identity.
 */
function normalizeLiveTrainResponse(raw, ctx) {
  const fetchedAt = new Date();
  const rawTrain = raw && raw.train;
  const trainNumber = safeStr((ctx && ctx.trainNumber) || rawTrain && rawTrain.number);
  const journeyDate = parseJourneyDate(raw && raw.startDate, ctx && ctx.journeyDate);
  const trainName = safeStr(raw && raw.trainName) || safeStr(rawTrain && rawTrain.name);

  const currentLocation = raw && raw.currentLocation && typeof raw.currentLocation === 'object' ? raw.currentLocation : null;
  const observedAt = parseObservationTime(raw && raw.lastUpdatedAt, fetchedAt);

  const status = normalizeStatus(raw && raw.status, currentLocation && currentLocation.status);
  const evidence = currentStopEvidence(raw && raw.route, currentLocation);

  const currentStationCode = safeStr(
    (currentLocation && currentLocation.stationCode) || (evidence && evidence.stationCode)
  );
  const currentStop = currentStationCode ? findStop(raw && raw.route, currentStationCode) : null;
  const currentStationName =
    safeStr(currentStop && currentStop.stationName) || safeStr(currentLocation && currentLocation.stationName) || null;

  const nextHalt = raw && raw.nextHalt;
  const nextStationCode = safeStr(nextHalt && nextHalt.stationCode);
  const nextStationName = safeStr(nextHalt && nextHalt.stationName);
  const prevStop = evidence && evidence.sequence
    ? (Array.isArray(raw.route) ? raw.route.find((s) => s.sequence === evidence.sequence - 1) : null)
    : null;

  // Real values ONLY — no station lat/lng, no scheduled speeds, no ETA math.
  const latitude = safeNum(currentLocation && currentLocation.lat);
  const longitude = safeNum(currentLocation && currentLocation.lng);
  const speedKmh = safeNum(currentLocation && currentLocation.speedKmh);

  const delayMinutes = raw && 'delayMinutes' in raw && safeNum(raw.delayMinutes) !== null
    ? safeNum(raw.delayMinutes)
    : null;
  const platform =
    safeStr(currentStop && currentStop.platform) ||
    safeStr(evidence && evidence.platform) ||
    null;

  const progress = computeProgress(raw && raw.route, evidence);

  const dataQuality = qualityOf(observedAt, fetchedAt, evidence, currentLocation);
  const dedupKey = computeDedupKey(
    trainNumber || '',
    journeyDate || '',
    observedAt.getTime(),
    status,
    currentStationCode || '',
    config.tracking.intervalSeconds * 1000
  );

  return {
    trainNumber,
    trainName,
    journeyDate,
    status,
    currentStationCode,
    currentStationName,
    nextStationCode,
    nextStationName,
    previousStationCode: prevStop && prevStop.stationCode ? String(prevStop.stationCode) : null,
    latitude,
    longitude,
    speedKmh,
    delayMinutes,
    platform,
    completionFraction: progress.completionFraction,
    coveredDistanceKm: progress.coveredDistanceKm,
    remainingDistanceKm: progress.remainingDistanceKm,
    totalDistanceKm: progress.totalDistanceKm,
    observedAt,
    fetchedAt,
    dataQuality,
    source: 'RAILRADAR',
    dedupKey,
  };
}

/**
 * Strong-evidence completion check (spec §19). Auto-complete ONLY when the
 * source reports the train as completed/arrived at the destination. Nothing
 * is inferred.
 */
function isStrongCompletionEvidence(snapshot, destinationStationCode) {
  if (!snapshot) return false;
  if (snapshot.status !== 'COMPLETED' && snapshot.status !== 'ARRIVED') return false;
  if (!destinationStationCode) return false;
  return String(snapshot.currentStationCode || '').toUpperCase() === String(destinationStationCode).toUpperCase();
}

module.exports = {
  normalizeLiveTrainResponse,
  computeDedupKey,
  dedupBucketMs,
  isStrongCompletionEvidence,
  STATUS_MAP,
};
