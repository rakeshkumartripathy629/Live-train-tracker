/**
 * Phase 7 — pure unit tests for the SSE live-patch merge (frontend).
 * Runs with Node's built-in type stripping (Node >= 22.18): the lib file only
 * has `import type`, which is erased, so no aliases need to resolve at runtime.
 *
 * Usage:
 *   node frontend/scripts/live-patch-test.mjs
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  applyLivePatch,
  normalizeLiveStatus,
} = require(path.join(__dirname, '..', 'lib', 'live-patch.ts'));

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
  } catch (err) {
    results.push({ name, pass: false, err: err?.message || String(err) });
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'assertion failed'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function baseJourney() {
  return {
    trainId: '12951',
    number: '12951',
    name: 'MUMBAI CENTRAL - NEW DELHI AC EXP',
    origin: { code: 'BCT', name: 'Mumbai Central' },
    destination: { code: 'NDLS', name: 'New Delhi' },
    currentLocation: { lat: 0, lng: 0, heading: 0, speedKmh: 0, isMoving: false },
    status: 'running',
    delayMinutes: 0,
    speedKmh: 0,
    distanceCoveredKm: 0,
    remainingDistanceKm: 0,
    totalDistanceKm: 0,
    completionPercentage: 0,
    lastUpdated: '2026-08-13T00:00:00.000Z',
    ETA: '',
    stations: [
      { code: 'BCT', name: 'Mumbai Central', lat: 18.97, lng: 72.82, scheduledArrival: '', scheduledDeparture: '16:35', delayMinutes: 0, distanceKm: 0, status: 'passed' },
      { code: 'ADI', name: 'Ahmedabad', lat: 23.02, lng: 72.57, scheduledArrival: '21:00', scheduledDeparture: '21:15', delayMinutes: 0, distanceKm: 490, status: 'upcoming' },
      { code: 'NDLS', name: 'New Delhi', lat: 28.64, lng: 77.22, scheduledArrival: '08:30', scheduledDeparture: '', delayMinutes: 0, distanceKm: 1384, status: 'upcoming' },
    ],
    previousStation: undefined,
    currentStation: undefined,
    nextStation: undefined,
    routeGeometry: [],
  };
}

// ─── normalizeLiveStatus ────────────────────────────────────────────────

test('status map: RUNNING -> running', () => assertEq(normalizeLiveStatus('RUNNING'), 'running'));
test('status map: NOT_STARTED -> not_started', () => assertEq(normalizeLiveStatus('NOT_STARTED'), 'not_started'));
test('status map: AT_STATION -> running', () => assertEq(normalizeLiveStatus('AT_STATION'), 'running'));
test('status map: DEPARTED -> running', () => assertEq(normalizeLiveStatus('DEPARTED'), 'running'));
test('status map: ARRIVED -> completed', () => assertEq(normalizeLiveStatus('ARRIVED'), 'completed'));
test('status map: COMPLETED -> completed', () => assertEq(normalizeLiveStatus('COMPLETED'), 'completed'));
test('status map: CANCELLED -> cancelled', () => assertEq(normalizeLiveStatus('CANCELLED'), 'cancelled'));
test('status map: DIVERTED -> cancelled', () => assertEq(normalizeLiveStatus('DIVERTED'), 'cancelled'));
test('status map: UNKNOWN -> null (no change)', () => assertEq(normalizeLiveStatus('UNKNOWN'), null));
test('status map: empty -> null', () => assertEq(normalizeLiveStatus(null), null));

// ─── applyLivePatch ─────────────────────────────────────────────────────

test('patch: status running (real value)', () => {
  const out = applyLivePatch(baseJourney(), { type: 'TRAIN_UPDATE', status: 'RUNNING' });
  assertEq(out.status, 'running');
});

test('patch: status completed via JOURNEY_COMPLETED payload', () => {
  const out = applyLivePatch(baseJourney(), { type: 'JOURNEY_COMPLETED', status: 'COMPLETED' });
  assertEq(out.status, 'completed');
});

test('patch: delayMinutes is copied verbatim (0 stays 0)', () => {
  const out = applyLivePatch(baseJourney(), { type: 'TRAIN_UPDATE', delayMinutes: 0 });
  assertEq(out.delayMinutes, 0);
  const out2 = applyLivePatch(baseJourney(), { type: 'TRAIN_DELAY_CHANGED', delayMinutes: 18 });
  assertEq(out2.delayMinutes, 18);
});

test('patch: speed + isMoving (real value)', () => {
  const out = applyLivePatch(baseJourney(), { type: 'TRAIN_UPDATE', speedKmh: 95 });
  assertEq(out.speedKmh, 95);
  assertEq(out.currentLocation.speedKmh, 95);
  assertEq(out.currentLocation.isMoving, true);
});

test('patch: lat/lng into currentLocation without inventing heading', () => {
  const out = applyLivePatch(baseJourney(), { type: 'TRAIN_UPDATE', latitude: 28.64, longitude: 77.22 });
  assertEq(out.currentLocation.lat, 28.64);
  assertEq(out.currentLocation.lng, 77.22);
  assertEq(out.currentLocation.heading, 0, 'heading must be preserved, never invented');
});

test('patch: completionFraction rounded to percentage', () => {
  const out = applyLivePatch(baseJourney(), { type: 'TRAIN_UPDATE', completionFraction: 0.5036 });
  assertEq(out.completionPercentage, 50.4);
});

test('patch: observedAt becomes lastUpdated', () => {
  const out = applyLivePatch(baseJourney(), { type: 'TRAIN_UPDATE', observedAt: '2026-08-13T05:00:00.000Z' });
  assertEq(out.lastUpdated, '2026-08-13T05:00:00.000Z');
});

test('patch: currentStation found -> stations marked passed/current/upcoming', () => {
  const out = applyLivePatch(baseJourney(), { type: 'TRAIN_STATION_CHANGED', currentStation: { code: 'ADI' } });
  assertEq(out.currentStation.code, 'ADI');
  assertEq(out.currentStation.name, 'Ahmedabad', 'name should come from the real route station');
  assertEq(out.stations[0].status, 'passed');
  assertEq(out.stations[1].status, 'current');
  assertEq(out.stations[2].status, 'upcoming');
});

test('patch: currentStation unknown -> no change (never fabricate a station)', () => {
  const j = baseJourney();
  const out = applyLivePatch(j, { type: 'TRAIN_UPDATE', currentStation: { code: 'XXXX', name: 'Some Halt' } });
  assert(out === j, 'unknown station must not create a partial/fabricated Station');
  assertEq(out.stations[0].status, 'passed', 'station list must not be reordered for unknown stations');
});

test('patch: nextStation found -> upcoming with real route data', () => {
  const out = applyLivePatch(baseJourney(), { type: 'TRAIN_UPDATE', nextStation: { code: 'NDLS' } });
  assertEq(out.nextStation.code, 'NDLS');
  assertEq(out.nextStation.name, 'New Delhi');
  assertEq(out.nextStation.status, 'upcoming');
});

test('patch: null fields do not wipe existing values', () => {
  const out = applyLivePatch(baseJourney(), { type: 'TRAIN_UPDATE', status: null, delayMinutes: null, latitude: null, longitude: null });
  assertEq(out.status, 'running');
  assertEq(out.delayMinutes, 0);
  assertEq(out.currentLocation.lat, 0);
});

test('patch: empty payload returns the same journey unchanged', () => {
  const j = baseJourney();
  const out = applyLivePatch(j, { type: 'TRAIN_UPDATE' });
  assert(out === j, 'no-op patch must return the same object reference');
});

test('patch: null journey returns null', () => {
  const out = applyLivePatch(null, { type: 'TRAIN_UPDATE' });
  assert(out === null, 'null journey must stay null');
});

let failed = 0;
console.log('\n┌─ Phase 7: live-patch merge (frontend) ─────────────────────');
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
  if (!r.pass) {
    console.log(`     └─ ${r.err}`);
    failed += 1;
  }
}
console.log(`└─ ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
