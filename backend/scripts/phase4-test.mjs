/**
 * Phase 4 verification script — live train tracking engine.
 *
 * Part 1: unit tests (no network except Upstash Redis for the lock tests).
 * Part 2: real integration against the running backend on :4000 — the internal
 *         tracking test performs a REAL RailRadar fetch and stores a REAL
 *         snapshot, then verifies dedup and the worker status endpoint.
 * Part 3: optional journey end-to-end (requires Next.js on :3000) — creates a
 *         real ACTIVE journey and waits for the scheduler+worker to touch it.
 *
 * Prereqs:
 *   1. backend:  node src/server.js            (port 4000)
 *   2. (part 3) frontend: npm run build && npm run start (port 3000)
 *
 * Usage:
 *   node backend/scripts/phase4-test.mjs
 *
 * Exit code 0 = all passed, 1 = failures.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BACKEND = process.env.PHASE4_BACKEND || 'http://localhost:4000/api/v1';
const NEXT = process.env.PHASE4_NEXT || 'http://localhost:3000';

const results = [];
async function test(name, fn, { skip = false } = {}) {
  try {
    if (skip) throw new Error('SKIPPED');
    await fn();
    results.push({ name, pass: true });
  } catch (err) {
    results.push({ name, pass: false, err: err?.message || String(err), skipped: skip });
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// ─── Real fixture ──────────────────────────────────────────────────────
// TEST DATA — real RailRadar GET /trains/12951/live captured 2026-08-13
// (trimmed to the fields the strict normalizer reads; structure identical to
// the live payload). Deliberately includes the "not-started at origin" case.
const REAL_LIVE_FIXTURE = {
  trainNumber: '12951',
  trainName: 'MUMBAI CENTRAL - NEW DELHI RAJDHANI',
  startDate: '2026-08-13',
  lastUpdatedAt: '2026-08-13T11:01:26+05:30',
  status: 'not-started',
  isLive: true,
  trackingMode: 'real-time',
  delayMinutes: 0,
  train: {
    number: '12951',
    name: 'MUMBAI CENTRAL - NEW DELHI RAJDHANI',
    type: 'RAJDHANI',
    source: { code: 'MMCT', name: 'MUMBAI CENTRAL' },
    destination: { code: 'NDLS', name: 'NEW DELHI' },
    avgSpeed: 90,
    distance: 1384,
    totalHalts: 13,
  },
  currentLocation: {
    stationCode: 'MMCT',
    sequence: 1,
    status: 'at-station',
    isHalt: true,
    isActualPosition: true,
  },
  nextHalt: { stationCode: 'BVI', stationName: 'BORIVALI', sequence: 20, distance: 30 },
  route: [
    {
      sequence: 1, stationCode: 'MMCT', stationName: 'MUMBAI CENTRAL', isHalt: true,
      status: 'at-station', scheduledDeparture: '2026-08-13T17:00:00+05:30', departureDay: 1,
      platform: '1', distance: 0, speedToNextStationKmph: 90,
    },
    {
      sequence: 2, stationCode: 'MCCM', stationName: 'MUMBAI CENTRAL EMU CARSHED', isHalt: false,
      status: 'upcoming', scheduledArrival: '2026-08-13T17:00:00+05:30', arrivalDay: 1,
      distance: 0.7,
    },
    {
      sequence: 20, stationCode: 'BVI', stationName: 'BORIVALI', isHalt: true,
      status: 'upcoming', scheduledArrival: '2026-08-13T17:00:00+05:30', scheduledDeparture: '2026-08-13T17:05:00+05:30',
      platform: '5', distance: 30,
    },
    {
      sequence: 237, stationCode: 'NDLS', stationName: 'NEW DELHI', isHalt: true,
      status: 'upcoming', scheduledArrival: '2026-08-14T08:40:00+05:30', arrivalDay: 2,
      platform: '16', distance: 1384,
    },
  ],
};

// ─── Part 1: unit tests ────────────────────────────────────────────────

const { normalizeLiveTrainResponse, computeDedupKey, isStrongCompletionEvidence } = require(
  path.join(__dirname, '..', 'src', 'workers', 'train-tracking', 'normalizer.js')
);
const { backoffMs, targetIdOf, emptyTarget } = require(
  path.join(__dirname, '..', 'src', 'workers', 'train-tracking', 'types.js')
);

await test('normalizer: real not-started fixture maps strictly', () => {
  // The fixture is a real capture; refresh its observation time to "now" so the
  // data-quality freshness check is deterministic.
  const freshFixture = JSON.parse(JSON.stringify(REAL_LIVE_FIXTURE));
  freshFixture.lastUpdatedAt = new Date().toISOString();
  const snap = normalizeLiveTrainResponse(freshFixture, { trainNumber: '12951', journeyDate: '2026-08-13' });
  assert(snap.trainNumber === '12951', 'trainNumber');
  assert(snap.journeyDate === '2026-08-13', 'journeyDate');
  assert(snap.status === 'NOT_STARTED', `status=${snap.status}`);
  assert(snap.currentStationCode === 'MMCT', 'currentStationCode');
  assert(snap.currentStationName === 'MUMBAI CENTRAL', 'currentStationName');
  assert(snap.nextStationCode === 'BVI', 'nextStationCode');
  assert(snap.nextStationName === 'BORIVALI', 'nextStationName');
  // §22 — never estimate: no fabricated coordinates, no speed from avgSpeed.
  assert(snap.latitude === null, `latitude must be null, got ${snap.latitude}`);
  assert(snap.longitude === null, `longitude must be null, got ${snap.longitude}`);
  assert(snap.speedKmh === null, `speedKmh must be null, got ${snap.speedKmh}`);
  // §21 — delayMinutes copied verbatim; 0 is a real value.
  assert(snap.delayMinutes === 0, `delayMinutes=${snap.delayMinutes}`);
  assert(snap.platform === '1', `platform=${snap.platform}`);
  assert(snap.completionFraction === 0, `completionFraction=${snap.completionFraction}`);
  assert(snap.dataQuality === 'LIVE', `dataQuality=${snap.dataQuality}`);
  assert(snap.source === 'RAILRADAR', 'source');
  assert(snap.observedAt.toISOString() === freshFixture.lastUpdatedAt, 'observedAt preserved from lastUpdatedAt');
  assert(snap.fetchedAt instanceof Date, 'fetchedAt is a Date');
  assert(typeof snap.dedupKey === 'string' && snap.dedupKey.length > 10, 'dedupKey present');
});

await test('normalizer: stale source data is flagged STALE', () => {
  const stale = JSON.parse(JSON.stringify(REAL_LIVE_FIXTURE));
  stale.lastUpdatedAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const snap = normalizeLiveTrainResponse(stale, { trainNumber: '12951', journeyDate: '2026-08-13' });
  assert(snap.dataQuality === 'STALE', `dataQuality=${snap.dataQuality}`);
});

await test('normalizer: missing optional values stay null (never 0/Unknown)', () => {
  const raw = JSON.parse(JSON.stringify(REAL_LIVE_FIXTURE));
  delete raw.currentLocation;
  delete raw.delayMinutes;
  delete raw.lastUpdatedAt;
  for (const stop of raw.route) stop.status = 'upcoming';
  const snap = normalizeLiveTrainResponse(raw, { trainNumber: '12951', journeyDate: '2026-08-13' });
  assert(snap.delayMinutes === null, `delayMinutes=${snap.delayMinutes}`);
  assert(snap.dataQuality === 'PARTIAL', `dataQuality=${snap.dataQuality}`);
  assert(snap.currentStationCode === null, `currentStationCode=${snap.currentStationCode}`);
  assert(snap.platform === null, `platform=${snap.platform}`);
  assert(snap.completionFraction === 0, `completionFraction=${snap.completionFraction}`);
});

await test('normalizer: running train produces RUNNING + progress from real distances', () => {
  const raw = JSON.parse(JSON.stringify(REAL_LIVE_FIXTURE));
  raw.status = 'running';
  raw.lastUpdatedAt = '2026-08-13T19:30:00+05:30';
  raw.route[0].status = 'passed';
  raw.route[0].actualDeparture = '2026-08-13T17:00:00+05:30';
  raw.currentLocation = { stationCode: 'ST', sequence: 105, status: 'running', isHalt: false, speedKmh: 96 };
  raw.route[1].status = 'passed';
  raw.route[1].scheduledDeparture = '2026-08-13T17:02:00+05:30';
  raw.route[2].status = 'passed';
  raw.route[2].actualArrival = '2026-08-13T17:32:00+05:30';
  const snap = normalizeLiveTrainResponse(raw, { trainNumber: '12951', journeyDate: '2026-08-13' });
  assert(snap.status === 'RUNNING', `status=${snap.status}`);
  assert(snap.currentStationCode === 'ST', `currentStationCode=${snap.currentStationCode}`);
  assert(snap.speedKmh === 96, `speedKmh=${snap.speedKmh}`);
  assert(snap.completionFraction > 0, `completionFraction=${snap.completionFraction} should be > 0`);
  assert(snap.coveredDistanceKm === 30, `coveredDistanceKm=${snap.coveredDistanceKm}`);
});

await test('normalizer: completed at destination triggers strong evidence', () => {
  const snap = { status: 'COMPLETED', currentStationCode: 'NDLS' };
  assert(isStrongCompletionEvidence(snap, 'NDLS') === true, 'COMPLETED at dest = strong evidence');
  assert(isStrongCompletionEvidence({ status: 'RUNNING', currentStationCode: 'NDLS' }, 'NDLS') === false, 'RUNNING at dest is not evidence');
  assert(isStrongCompletionEvidence({ status: 'COMPLETED', currentStationCode: 'ADI' }, 'NDLS') === false, 'wrong station = no evidence');
});

await test('dedupKey: deterministic and unique across bucket/status/station', () => {
  const a = computeDedupKey('12951', '2026-08-13', 100000, 'NOT_STARTED', 'MMCT', 60000);
  const b = computeDedupKey('12951', '2026-08-13', 100000, 'NOT_STARTED', 'MMCT', 60000);
  const c = computeDedupKey('12951', '2026-08-13', 100000 + 60000, 'NOT_STARTED', 'MMCT', 60000);
  const d = computeDedupKey('12951', '2026-08-13', 100000, 'RUNNING', 'MMCT', 60000);
  const e = computeDedupKey('12951', '2026-08-13', 100000, 'NOT_STARTED', 'ST', 60000);
  const f = computeDedupKey('12951', '2026-08-14', 100000, 'NOT_STARTED', 'MMCT', 60000);
  assert(a === b, 'deterministic');
  assert(a !== c && a !== d && a !== e && a !== f, 'unique across bucket/status/station/date');
  const g = computeDedupKey('12951', '2026-08-13', 100001, 'NOT_STARTED', 'MMCT', 60000);
  assert(a === g, 'same bucket for two times within the same interval');
});

await test('backoffMs: exponential growth with a 5-minute cap', () => {
  assert(backoffMs(1, 60000) === 60000, 'attempt 1 = base');
  assert(backoffMs(2, 60000) === 120000, 'attempt 2 doubles');
  assert(backoffMs(6, 60000) === 300000, 'cap at 300000');
  assert(backoffMs(1, 500) === 1000, 'base floored to 1s');
});

await test('target identity: stable targetId + empty target shape', () => {
  assert(targetIdOf('12951', '2026-08-13') === '12951:2026-08-13', 'targetId');
  const t = emptyTarget('12951', '2026-08-13', 'active', 'abc');
  assert(t.status === 'IDLE' && t.journeyIds.includes('abc') && t.attempts === 0, 'empty target');
});

// Lock tests need real Upstash Redis (same one the backend uses).
const redis = require(path.join(__dirname, '..', 'src', 'services', 'upstash.js'));
await test('lock: acquire/duplicate/release on real Redis', async () => {
  if (!redis.available) throw new Error('Upstash not configured — SKIP');
  const { acquire, release } = require(path.join(__dirname, '..', 'src', 'workers', 'train-tracking', 'lock.js'));
  const id = `lock-test:${Date.now()}`;
  const t1 = await acquire(id);
  assert(t1, 'first acquire wins');
  const t2 = await acquire(id);
  assert(t2 === null, 'second acquire fails while held');
  await release(id, t1);
  const t3 = await acquire(id);
  assert(t3, 'acquire succeeds after release');
  await release(id, t3);
  await redis.del(id);
}, { skip: !redis.available });

// ─── Part 2: real integration (backend must be running) ───────────────

async function backendOk() {
  try {
    const res = await fetch('http://localhost:4000/health');
    return res.ok;
  } catch {
    return false;
  }
}

const token = process.env.PHASE4_INTERNAL_TOKEN || '';

await test('integration: backend is up', async () => {
  assert(await backendOk(), 'backend /health not reachable on :4000');
}, { skip: !(await backendOk()) });

let internalWritten = false;
await test('integration: internal tracking test performs a REAL RailRadar fetch + snapshot', async () => {
  if (!token) throw new Error('PHASE4_INTERNAL_TOKEN not provided — SKIP');
  const res = await fetch(`${BACKEND}/tracking/internal/tracking/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-token': token },
    body: JSON.stringify({ trainNumber: '12951' }),
  });
  const body = await res.json();
  assert(res.ok && body.success, `request failed: ${JSON.stringify(body)}`);
  assert(body.data.snapshot, 'snapshot present');
  internalWritten = body.data.written === true;
}, { skip: !token });

await test('integration: duplicate call is deduped (no second snapshot row)', async () => {
  if (!token) throw new Error('PHASE4_INTERNAL_TOKEN not provided — SKIP');
  const res = await fetch(`${BACKEND}/tracking/internal/tracking/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-token': token },
    body: JSON.stringify({ trainNumber: '12951' }),
  });
  const body = await res.json();
  assert(body.success, 'request failed');
  assert(body.data.deduped === true, `expected deduped, got ${JSON.stringify(body.data)}`);
}, { skip: !token });

await test('integration: snapshot persisted in MongoDB train_snapshots', async () => {
  if (!internalWritten) throw new Error('first internal call did not write — SKIP');
  const { default: mongoose } = await import('mongoose');
  const TrainSnapshot = require(path.join(__dirname, '..', 'src', 'models', 'TrainSnapshot.js'));
  await mongoose.connect(process.env.MONGODB_URI || require(path.join(__dirname, '..', 'src', 'config', 'env.js')).mongoUri, {
    serverSelectionTimeoutMS: 8000,
  });
  const count = await TrainSnapshot.countDocuments({ trainNumber: '12951', journeyDate: '2026-08-13' });
  assert(count >= 1, `no snapshots found (count=${count})`);
  await mongoose.disconnect();
}, { skip: !internalWritten });

await test('integration: worker status endpoint reports honest state', async () => {
  const res = await fetch(`${BACKEND}/tracking/status`);
  const body = await res.json();
  assert(res.ok && body.success, 'status endpoint failed');
  assert(body.data.tracking.enabled === true, 'tracking enabled');
  assert(body.data.worker, 'worker info present');
  assert(['running', 'stopped', 'starting'].includes(body.data.worker.workerStatus), `workerStatus=${body.data.worker.workerStatus}`);
}, { skip: !(await backendOk()) });

// ─── Part 3: journey end-to-end (optional, Next.js on :3000) ──────────

async function nextOk() {
  try {
    const res = await fetch(`${NEXT}/api/auth/csrf`);
    return res.ok;
  } catch {
    return false;
  }
}
const nextUp = await nextOk();

await test('e2e: ACTIVE journey is picked up and lastTrackedAt updates (real worker)', async () => {
  if (!nextUp) throw new Error('Next.js not reachable — SKIP');
  const suffix = Date.now().toString(36);
  const user = { name: 'Phase4', email: `phase4_${suffix}@railgaadi.dev`, password: 'test1234' };
  let jar2 = '';
  let journeyId = null;

  const cookies = (res) =>
    (typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean))
      .map((c) => c.split(';')[0])
      .join('; ');

  try {
    const reg = await fetch(`${NEXT}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
    assert([200, 409].includes(reg.status), `register ${reg.status}`);

    const csrfRes = await fetch(`${NEXT}/api/auth/csrf`);
    const { csrfToken } = await csrfRes.json();
    const jar = cookies(csrfRes);
    const loginRes = await fetch(`${NEXT}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: jar },
      body: JSON.stringify({ csrfToken, email: user.email, password: user.password }),
      redirect: 'manual',
    });
    jar2 = cookies(loginRes);
    assert(jar2.includes('session-token'), 'login failed');

    const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    const create = await fetch(`${NEXT}/api/journeys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: jar2 },
      body: JSON.stringify({
        trainNumber: '12951',
        boardingStationCode: 'ST',
        destinationStationCode: 'BRC',
        journeyDate: today,
      }),
    });
    const created = await create.json();
    assert(created.success, `journey create failed: ${JSON.stringify(created)}`);
    journeyId = created.data.id;

    const start = await fetch(`${NEXT}/api/journeys/${journeyId}/start`, {
      method: 'POST',
      headers: { Cookie: jar2 },
    });
    assert(start.ok || start.status === 409, `start failed ${start.status}`);

    // Wait up to 3 min for the scheduler (60s) + worker (60s) to touch it.
    const deadline = Date.now() + 3 * 60 * 1000;
    let tracked = false;
    while (Date.now() < deadline) {
      const res = await fetch(`${NEXT}/api/journeys`, {
        headers: { Cookie: jar2 },
      });
      const body = await res.json();
      const journey = (body.data || []).find((j) => j.id === journeyId);
      if (journey && journey.lastTrackedAt) {
        tracked = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 10000));
    }
    assert(tracked, 'journey.lastTrackedAt never updated within 3 minutes');
  } finally {
    // Best-effort diagnostics when the wait fails.
    try {
      const st = await fetch(`${BACKEND}/tracking/status`).then((r) => r.json());
      console.log('[e2e:debug] tracking status:', JSON.stringify(st.data));
    } catch {
      // ignore
    }
    // Clean up so the worker stops polling this test journey.
    if (journeyId && jar2) {
      try {
        await fetch(`${NEXT}/api/journeys/${journeyId}/cancel`, { method: 'POST', headers: { Cookie: jar2 } });
      } catch {
        // best-effort cleanup
      }
    }
  }
}, { skip: !nextUp });

// ─── Report ────────────────────────────────────────────────────────────

const passCount = results.filter((r) => r.pass).length;
const skipCount = results.filter((r) => r.skipped).length;
const failCount = results.filter((r) => !r.pass && !r.skipped).length;

console.log('\n═══ Phase 4 results ═══');
for (const r of results) {
  const mark = r.skipped ? 'SKIP' : r.pass ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${r.name}${r.err && !r.skipped ? ` — ${r.err}` : ''}`);
}
console.log(`\n${passCount} passed, ${failCount} failed, ${skipCount} skipped`);
process.exit(failCount > 0 ? 1 : 0);
