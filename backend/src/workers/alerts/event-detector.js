// Event detector (Phase 5 §2–§16). PURE functions only — no I/O, no random
// data. Compares the previous REAL snapshot against the current REAL snapshot
// and returns only transitions that are actually supported by the data.
//
// Hard rules:
//   - Never trigger on a missing/absent value (both sides must be real).
//   - No inference from time passing or a page rendering.
//   - ETA_CHANGED and TRAIN_APPROACHING are intentionally not produced: the
//     RailRadar live payload exposes neither an ETA nor train coordinates.

const { EVENT_TYPES } = require('./types');

function isStartedState(status) {
  return ['RUNNING', 'DEPARTED', 'AT_STATION', 'ARRIVED', 'COMPLETED'].includes(status);
}

/**
 * Detect transitions between two snapshots.
 *
 * `previous` may be null (first observation); then only "current already
 * started" style events that are unambiguous are emitted (never arrival/
 * departure, which need a real transition).
 *
 * Returns an array of event objects:
 *   { type, trainNumber, journeyDate, stationCode?, stationName?, previous?, current?, payload }
 */
function detectEvents(previous, current) {
  if (!current) return [];
  const events = [];
  const trainNumber = current.trainNumber;
  const journeyDate = current.journeyDate;
  const prev = previous || null;
  const prevStatus = prev ? prev.status : null;
  const currStatus = current.status;
  const currStation = current.currentStationCode || null;
  const currStationName = current.currentStationName || null;
  const prevStation = prev ? prev.currentStationCode : null;
  const observedAtMs = current.observedAt ? current.observedAt.getTime() : Date.now();

  const base = (type, stationCode = currStation, stationName = currStationName, payload = {}) => ({
    type,
    trainNumber,
    journeyDate,
    stationCode: stationCode || null,
    stationName: stationName || null,
    previous: prev ? prev.status : null,
    current: currStatus,
    payload,
    observedAtMs,
  });

  // ─── TRAIN_STARTED (real NOT_STARTED → running state) ──────────────
  if (isStartedState(currStatus) && (!prevStatus || prevStatus === 'NOT_STARTED' || prevStatus === 'UNKNOWN')) {
    events.push(base('TRAIN_STARTED'));
  }

  // ─── TRAIN_DEPARTED (real station-state transitions) ────────────────
  if (currStatus === 'DEPARTED' && prevStatus !== 'DEPARTED') {
    events.push(base('TRAIN_DEPARTED'));
  } else if (
    prevStatus === 'AT_STATION' &&
    currStatus === 'RUNNING' &&
    currStation &&
    prevStation &&
    currStation !== prevStation
  ) {
    events.push(base('TRAIN_DEPARTED', prevStation));
  }

  // ─── TRAIN_ARRIVED (real station-state transitions) ─────────────────
  if (currStatus === 'ARRIVED' && prevStatus !== 'ARRIVED') {
    events.push(base('TRAIN_ARRIVED'));
  } else if (
    (prevStatus === 'RUNNING' || prevStatus === 'DEPARTED') &&
    currStatus === 'AT_STATION' &&
    currStation &&
    prevStation &&
    currStation !== prevStation
  ) {
    events.push(base('TRAIN_ARRIVED', currStation, currStationName));
  }

  // ─── Delay events — both values must be REAL numbers (§3) ───────────
  const prevDelay = typeof prev?.delayMinutes === 'number' ? prev.delayMinutes : null;
  const currDelay = typeof current.delayMinutes === 'number' ? current.delayMinutes : null;

  if (currDelay !== null && currDelay > 0 && (prevDelay === null || prevDelay === 0)) {
    events.push(
      base('DELAY_STARTED', null, null, {
        previousDelayMinutes: prevDelay === null ? 0 : prevDelay,
        currentDelayMinutes: currDelay,
        differenceMinutes: currDelay - (prevDelay === null ? 0 : prevDelay),
      })
    );
  }
  if (prevDelay !== null && currDelay !== null && currDelay > prevDelay) {
    events.push(
      base('DELAY_INCREASED', null, null, {
        previousDelayMinutes: prevDelay,
        currentDelayMinutes: currDelay,
        differenceMinutes: currDelay - prevDelay,
      })
    );
  }
  if (prevDelay !== null && currDelay !== null && currDelay < prevDelay) {
    events.push(
      base('DELAY_REDUCED', null, null, {
        previousDelayMinutes: prevDelay,
        currentDelayMinutes: currDelay,
        differenceMinutes: prevDelay - currDelay,
      })
    );
  }

  // ─── Cancellation / diversion — ONLY when the source reports it ─────
  if (currStatus === 'CANCELLED' && prevStatus !== 'CANCELLED') {
    events.push(base('TRAIN_CANCELLED'));
  }
  if (currStatus === 'DIVERTED' && prevStatus !== 'DIVERTED') {
    events.push(base('TRAIN_DIVERTED'));
  }

  return events;
}

/**
 * A snapshot is "fresh" when the source observation is not flagged STALE
 * (dataQuality LIVE or PARTIAL). Used for LIVE_DATA_STALE / RECOVERED.
 */
function isFreshSnapshot(snapshot) {
  return Boolean(snapshot) && snapshot.dataQuality !== 'STALE';
}

module.exports = { detectEvents, isFreshSnapshot, EVENT_TYPES };
