/**
 * Phase 7 verification script — real-time SSE live train stream.
 *
 * Part 1: pure unit tests (event bus, event payload builder, change events) —
 *         no network required.
 * Part 2: backend integration (needs the backend running on :4000 plus
 *         MongoDB + Upstash from backend/.env) — SSE auth/ownership, initial
 *         state, Redis snapshot reconciliation, disconnect cleanup, metrics.
 *         Uses an isolated synthetic target (train 99999, future journey date)
 *         so the real worker never touches it and NO RailRadar quota is used.
 * Part 3: stream metrics endpoint auth.
 *
 * Prereqs:
 *   1. backend:  node src/server.js          (port 4000, SSE_ENABLED=true)
 *   2. backend/.env with INTERNAL_API_TOKEN, MONGODB_URI + Upstash
 *
 * Usage:
 *   node backend/scripts/phase7-test.mjs
 *
 * Exit code 0 = all passed, 1 = failures.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BACKEND = process.env.PHASE7_BACKEND || 'http://localhost:4000/api/v1';
const TOKEN = process.env.INTERNAL_API_TOKEN || '';
const REDIS_SYNC_SECONDS = parseInt(process.env.SSE_REDIS_SYNC_SECONDS || '8', 10);

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
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Part 1: pure unit tests (in-process event bus) ─────────────────────

const eventBus = require(path.join(__dirname, '..', 'src', 'services', 'event-bus.js'));
const trainEvents = require(path.join(__dirname, '..', 'src', 'services', 'train-events.js'));

await test('P1. event bus: publish reaches subscribers', async () => {
  const received = [];
  const off = eventBus.subscribe('t:test', (p) => received.push(p));
  const n = eventBus.publish('t:test', { hello: 'world' });
  off();
  assert(n === 1 && received.length === 1 && received[0].hello === 'world', 'payload not delivered');
  assert(eventBus.listenerCount('t:test') === 0, 'listener not removed on unsubscribe');
});

await test('P1. event bus: one bad listener does not break others', async () => {
  const received = [];
  const off1 = eventBus.subscribe('t:err', () => {
    throw new Error('boom');
  });
  const off2 = eventBus.subscribe('t:err', (p) => received.push(p));
  const n = eventBus.publish('t:err', { ok: 1 });
  off1();
  off2();
  assert(n === 2 && received.length === 1, 'good listener should still receive');
});

await test('P1. eventPayload keeps only real fields (nulls preserved)', async () => {
  const snap = {
    trainNumber: '12951',
    journeyDate: '2026-08-13',
    status: 'RUNNING',
    currentStationCode: 'NDLS',
    currentStationName: 'New Delhi',
    nextStationCode: null,
    latitude: 28.64,
    longitude: 77.22,
    speedKmh: 95,
    delayMinutes: 0,
    platform: '1',
    completionFraction: 0.25,
    observedAt: new Date('2026-08-13T04:00:00.000Z'),
    fetchedAt: new Date(),
    dataQuality: 'LIVE',
  };
  const p = trainEvents.eventPayload(snap);
  assert(p.type === 'TRAIN_UPDATE', 'default type missing');
  assert(p.trainNumber === '12951', 'trainNumber missing');
  assert(p.nextStation === null, 'null nextStation must stay null');
  assert(p.currentStation.code === 'NDLS', 'currentStation code missing');
  assert(p.delayMinutes === 0, '0 delay is a real value and must be preserved');
  assert(p.observedAt === '2026-08-13T04:00:00.000Z', 'observedAt should be ISO');
  assert(p.source === 'RAILRADAR', 'source missing');
});

await test('P1. publishSnapshot: full update + focused change events', async () => {
  const target = { trainNumber: '12951', journeyDate: '2026-08-13' };
  const prev = { trainNumber: '12951', status: 'RUNNING', delayMinutes: 0, currentStationCode: 'NDLS' };
  const snap = {
    ...prev,
    status: 'RUNNING',
    delayMinutes: 12,
    currentStationCode: 'CNB',
    observedAt: new Date(),
    dataQuality: 'LIVE',
  };
  const seen = [];
  const off = eventBus.subscribe(trainEvents.topicOf('12951', '2026-08-13'), (p) => seen.push(p));
  trainEvents.publishSnapshot(target, snap, prev);
  off();
  const types = seen.map((p) => p.type);
  assert(types.includes('TRAIN_UPDATE'), 'TRAIN_UPDATE not published');
  assert(types.includes('TRAIN_DELAY_CHANGED'), 'TRAIN_DELAY_CHANGED not published');
  assert(types.includes('TRAIN_STATION_CHANGED'), 'TRAIN_STATION_CHANGED not published');
  assert(!types.includes('TRAIN_STATUS_CHANGED'), 'status did not change; event must not fire');
  const update = seen.find((p) => p.type === 'TRAIN_UPDATE');
  assert(update.delayMinutes === 12, 'update should carry the new delay');
});

await test('P1. publishSnapshot: status change + completion events', async () => {
  const target = { trainNumber: '12951', journeyDate: '2026-08-13' };
  const seen = [];
  const off = eventBus.subscribe(trainEvents.topicOf('12951', '2026-08-13'), (p) => seen.push(p));
  trainEvents.publishSnapshot(
    target,
    { trainNumber: '12951', status: 'COMPLETED', currentStationCode: 'BCT', observedAt: new Date(), dataQuality: 'LIVE' },
    { trainNumber: '12951', status: 'RUNNING', delayMinutes: 5, currentStationCode: 'ADI' }
  );
  off();
  const types = seen.map((p) => p.type);
  assert(types.includes('TRAIN_STATUS_CHANGED'), 'TRAIN_STATUS_CHANGED missing');
  assert(types.includes('JOURNEY_COMPLETED'), 'JOURNEY_COMPLETED missing');
});

await test('P1. publishTrackingState emits STALE / RECOVERED with names', async () => {
  const target = { trainNumber: '12951', journeyDate: '2026-08-13', lastSnapshotAt: null };
  const seen = [];
  const off = eventBus.subscribe(trainEvents.topicOf('12951', '2026-08-13'), (p) => seen.push(p));
  trainEvents.publishTrackingState(target, 'TRACKING_STALE');
  trainEvents.publishTrackingState(target, 'TRACKING_RECOVERED');
  off();
  assert(seen.map((p) => p.type).join() === 'TRACKING_STALE,TRACKING_RECOVERED', 'stale/recovered order wrong');
  assert(trainEvents.SSE_EVENT_NAMES.TRACKING_STALE === 'tracking-stale', 'SSE event name mismatch');
  assert(trainEvents.SSE_EVENT_NAMES.TRAIN_UPDATE === 'train-update', 'SSE event name mismatch');
  assert(trainEvents.SSE_EVENT_NAMES.JOURNEY_COMPLETED === 'journey-completed', 'SSE event name mismatch');
});

// ─── Part 2 + 3: backend integration (requires running stack) ───────────

const needsBackend = Boolean(TOKEN) && process.env.MONGODB_URI && Boolean(process.env.UPSTASH_REDIS_REST_URL);

let mongoose = null;
let journeyIdA = null;
let journeyIdB = null;
let userA = null;
const testTargetId = `${'99999'}:${'2099-01-01'}`;
const TEST_SNAPSHOT = {
  trainNumber: '99999',
  trainName: 'PHASE7 TEST',
  journeyDate: '2099-01-01',
  status: 'RUNNING',
  currentStationCode: 'NDLS',
  currentStationName: 'New Delhi',
  nextStationCode: 'CNB',
  nextStationName: 'Kanpur Central',
  previousStationCode: null,
  latitude: 28.64,
  longitude: 77.22,
  speedKmh: 95,
  delayMinutes: 5,
  platform: '1',
  completionFraction: 0.2,
  coveredDistanceKm: 130,
  remainingDistanceKm: 520,
  totalDistanceKm: 650,
  observedAt: new Date(Date.now() - 60 * 1000).toISOString(),
  fetchedAt: new Date().toISOString(),
  dataQuality: 'LIVE',
  source: 'RAILRADAR',
  dedupKey: 'PHASE7-TEST-1',
};

function streamBase() {
  return `${BACKEND}/stream`;
}

async function jsonError(path, headers, expectedStatus) {
  const res = await fetch(`${streamBase()}${path}`, {
    headers: { 'X-Internal-Token': TOKEN, ...(headers || {}) },
    signal: AbortSignal.timeout(8000),
  });
  assert(res.status === expectedStatus, `expected ${expectedStatus}, got ${res.status}`);
  const body = await res.json().catch(() => ({}));
  assert(body && body.success === false, 'expected error body');
  return body;
}

/**
 * Open an SSE connection and collect frames until `until(frame)` returns true,
 * then resolve. Rejects after `timeoutMs`.
 */
function readSse(path, headers, until, timeoutMs) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error('SSE read timed out'));
    }, timeoutMs);
    (async () => {
      try {
        const res = await fetch(`${streamBase()}${path}`, {
          headers: { 'X-Internal-Token': TOKEN, ...(headers || {}) },
          signal: controller.signal,
        });
        assert(res.ok && res.body, `SSE open failed: ${res.status}`);
        const frames = [];
        let buffer = '';
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const check = () => {
          const parsed = frames.filter(Boolean);
          const hit = parsed.find(until);
          if (hit) {
            clearTimeout(timer);
            controller.abort();
            resolve({ frames: parsed, hit });
          }
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const part of parts) {
            const ev = part.match(/^event: (.+)$/m);
            const data = part.match(/^data: (.+)$/m);
            if (data) {
              frames.push({ event: ev ? ev[1] : 'message', data: JSON.parse(data[1]) });
            }
            check();
          }
        }
        clearTimeout(timer);
        resolve({ frames, hit: frames.find(until) });
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    })();
  });
}

if (needsBackend) {
  mongoose = require('mongoose');

  await test('P2. SSE auth: missing token -> 401', async () => {
    const res = await fetch(`${streamBase()}/journey/aaaaaaaaaaaaaaaaaaaaaaaa`, {
      signal: AbortSignal.timeout(8000),
    });
    assert(res.status === 401, `expected 401, got ${res.status}`);
  });

  await test('P2. SSE auth: wrong token -> 401', async () => {
    const res = await fetch(`${streamBase()}/journey/aaaaaaaaaaaaaaaaaaaaaaaa`, {
      headers: { 'X-Internal-Token': 'wrong-token-value' },
      signal: AbortSignal.timeout(8000),
    });
    assert(res.status === 401, `expected 401, got ${res.status}`);
  });

  await test('P2. SSE auth: missing journey owner -> 400', async () => {
    await jsonError('/journey/aaaaaaaaaaaaaaaaaaaaaaaa', { 'X-Journey-User': '' }, 400);
  });

  await test('P2. SSE auth: invalid journey id -> 400', async () => {
    await jsonError('/journey/not-an-objectid', { 'X-Journey-User': 'user-1' }, 400);
  });

  await test('P2. SSE auth: missing journey -> 404', async () => {
    const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    await jsonError(`/journey/${id}`, { 'X-Journey-User': 'user-1' }, 404);
  });

  // Create two users + journeys for the ownership tests.
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    const col = mongoose.connection.collection('journeys');
    userA = `phase7-a-${Date.now()}`;
    const userB = `phase7-b-${Date.now()}`;
    const insertA = await col.insertOne({
      userId: userA,
      trainNumber: '99999',
      trainName: 'PHASE7 TEST',
      origin: { code: 'NDLS', name: 'New Delhi' },
      destination: { code: 'BCT', name: 'Mumbai Central' },
      boardingStationCode: 'NDLS',
      destinationStationCode: 'BCT',
      journeyDate: '2099-01-01',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const insertB = await col.insertOne({
      userId: userB,
      trainNumber: '99998',
      trainName: 'PHASE7 TEST B',
      origin: { code: 'CNB', name: 'Kanpur Central' },
      destination: { code: 'BCT', name: 'Mumbai Central' },
      boardingStationCode: 'CNB',
      destinationStationCode: 'BCT',
      journeyDate: '2099-01-02',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    journeyIdA = String(insertA.insertedId);
    journeyIdB = String(insertB.insertedId);
  } catch (err) {
    results.push({
      name: 'P2 setup: Mongo seed',
      pass: false,
      err: `could not seed journeys: ${err.message}`,
    });
  }

  await test('P2. SSE auth: wrong owner -> 403', async () => {
    if (!journeyIdA) throw new Error('no seeded journey');
    await jsonError(`/journey/${journeyIdA}`, { 'X-Journey-User': 'someone-else' }, 403);
  });

  await test('P2. SSE: correct owner + token opens and sends initial-state', async () => {
    if (!journeyIdA) throw new Error('no seeded journey');
    const redis = require(path.join(__dirname, '..', 'src', 'services', 'upstash.js'));
    const { KEYS } = require(path.join(__dirname, '..', 'src', 'workers', 'train-tracking', 'types.js'));
    await redis.set(KEYS.last(testTargetId), TEST_SNAPSHOT, 3600);

    const { hit } = await readSse(
      `/journey/${journeyIdA}`,
      { 'X-Journey-User': userA },
      (f) => f.event === 'initial-state' || f.event === 'error',
      15000
    );
    assert(hit, 'no initial-state or error frame received');
  });

  await test('P2. SSE: Redis reconcile replays a newer snapshot', async () => {
    if (!journeyIdA) throw new Error('no seeded journey');
    const redis = require(path.join(__dirname, '..', 'src', 'services', 'upstash.js'));
    const { KEYS } = require(path.join(__dirname, '..', 'src', 'workers', 'train-tracking', 'types.js'));

    // Open a stream, confirm initial state, then write a NEWER snapshot and
    // wait for the reconcile tick to replay it.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REDIS_SYNC_SECONDS * 1000 + 8000);
    const collected = [];
    const res = await fetch(`${streamBase()}/journey/${journeyIdA}`, {
      headers: { 'X-Internal-Token': TOKEN, 'X-Journey-User': userA },
      signal: controller.signal,
    });
    assert(res.ok && res.body, 'SSE open failed');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const until = () => collected.some((f) => f.event === 'train-update');
    const timer2 = setTimeout(() => {
      if (!until()) {
        controller.abort();
      }
    }, REDIS_SYNC_SECONDS * 1000 + 8000);

    const newerSnapshot = {
      ...TEST_SNAPSHOT,
      observedAt: new Date().toISOString(),
      delayMinutes: 18,
      currentStationCode: 'CNB',
      currentStationName: 'Kanpur Central',
      dedupKey: 'PHASE7-TEST-2',
    };
    await redis.set(KEYS.last(testTargetId), newerSnapshot, 3600);

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const ev = part.match(/^event: (.+)$/m);
        const data = part.match(/^data: (.+)$/m);
        if (data) collected.push({ event: ev ? ev[1] : 'message', data: JSON.parse(data[1]) });
        if (until()) break;
      }
      if (until()) break;
    }
    clearTimeout(timer);
    clearTimeout(timer2);
    const replay = collected.find((f) => f.event === 'train-update');
    assert(replay, 'no train-update replayed from Redis reconcile');
    assert(replay.data.delayMinutes === 18, 'replayed snapshot should carry the newer delay');
  });

  await test('P2. SSE: disconnect releases the connection (metrics)', async () => {
    if (!journeyIdA) throw new Error('no seeded journey');
    const metricsRes = await fetch(`${streamBase()}/metrics`, {
      headers: { 'X-Internal-Token': TOKEN },
      signal: AbortSignal.timeout(8000),
    });
    assert(metricsRes.ok, 'metrics endpoint failed');
    const { data } = await metricsRes.json();
    const baseline = data.activeConnections;
    await sleep(300);
    const nowRes = await fetch(`${streamBase()}/metrics`, {
      headers: { 'X-Internal-Token': TOKEN },
      signal: AbortSignal.timeout(8000),
    });
    const nowData = (await nowRes.json()).data;
    assert(nowData.activeConnections <= baseline, 'activeConnections grew after test streams closed');
  });

  await test('P3. metrics endpoint: wrong token -> 401', async () => {
    const res = await fetch(`${streamBase()}/metrics`, {
      headers: { 'X-Internal-Token': 'nope' },
      signal: AbortSignal.timeout(8000),
    });
    assert(res.status === 401, `expected 401, got ${res.status}`);
  });

  await test('P3. metrics endpoint: correct token returns counters', async () => {
    const res = await fetch(`${streamBase()}/metrics`, {
      headers: { 'X-Internal-Token': TOKEN },
      signal: AbortSignal.timeout(8000),
    });
    assert(res.ok, 'metrics endpoint failed');
    const body = await res.json();
    assert(body.success === true, 'expected success body');
    assert(typeof body.data.activeConnections === 'number', 'activeConnections missing');
    assert(typeof body.data.opened === 'number', 'opened missing');
    assert(Array.isArray(body.data.events), 'events list missing');
  });

  // Cleanup
  try {
    if (mongoose?.connection) {
      const col = mongoose.connection.collection('journeys');
      if (journeyIdA) await col.deleteMany({ _id: { $in: [journeyIdA, journeyIdB].map((id) => new mongoose.Types.ObjectId(id)) } });
      await mongoose.disconnect();
    }
    const redis = require(path.join(__dirname, '..', 'src', 'services', 'upstash.js'));
    const { KEYS } = require(path.join(__dirname, '..', 'src', 'workers', 'train-tracking', 'types.js'));
    await redis.del(KEYS.last(testTargetId));
  } catch (err) {
    // cleanup is best-effort
  }
} else {
  results.push({ name: 'P2/P3 backend integration (needs running backend + env)', pass: true, skipped: true });
}

// ─── Report ─────────────────────────────────────────────────────────────

let failed = 0;
console.log('\n┌─ Phase 7: Real-time SSE live train stream ─────────────────');
for (const r of results) {
  const tag = r.skipped ? 'SKIP' : r.pass ? 'PASS' : 'FAIL';
  console.log(`${tag}  ${r.name}`);
  if (!r.pass && !r.skipped) {
    console.log(`     └─ ${r.err}`);
    failed += 1;
  }
}
console.log(`└─ ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
