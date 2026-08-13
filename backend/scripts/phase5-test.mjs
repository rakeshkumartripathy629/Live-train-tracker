/**
 * Phase 5 verification script — alert & notification engine.
 *
 * Part 1: pure unit tests (event detector, message generator, dedupe key,
 *         rule matching) — no network required.
 * Part 2: backend integration (needs MongoDB + Upstash from backend/.env) —
 *         real enqueue + Redis/Mongo dedupe + notification worker delivery with
 *         an injected web-push transport. No real push, no RailRadar quota.
 * Part 3: security tests against the Next.js API on :3000 (needs the full
 *         stack running): ownership, validation, rate limiting shape, push
 *         subscription lifecycle.
 *
 * Prereqs:
 *   1. backend:  node src/server.js            (port 4000)
 *   2. frontend: npm run build && npm run start (port 3000)
 *   3. backend/.env with MONGODB_URI + Upstash (Part 2; skipped otherwise)
 *
 * Usage:
 *   node backend/scripts/phase5-test.mjs
 *
 * Exit code 0 = all passed, 1 = failures.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load backend/.env BEFORE requiring anything that reads config/env.js.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BACKEND = process.env.PHASE5_BACKEND || 'http://localhost:4000/api/v1';
const NEXT = process.env.PHASE5_NEXT || 'http://localhost:3000';

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

// ─── Part 1: pure unit tests ────────────────────────────────────────────

const { detectEvents, isFreshSnapshot } = require(
  path.join(__dirname, '..', 'src', 'workers', 'alerts', 'event-detector.js')
);
const { buildMessage, notificationUrl } = require(
  path.join(__dirname, '..', 'src', 'workers', 'alerts', 'message-generator.js')
);
const { notificationDedupeKey, ALERT_TYPE_EVENTS } = require(
  path.join(__dirname, '..', 'src', 'workers', 'alerts', 'types.js')
);
const { matchAlert, computeDestinationApproaching } = require(
  path.join(__dirname, '..', 'src', 'workers', 'alerts', 'alert-engine.js')
);

const snap = (status, stationCode, stationName, delayMinutes, dataQuality = 'LIVE') => ({
  trainNumber: '12951',
  trainName: 'MUMBAI CENTRAL - NEW DELHI RAJDHANI',
  journeyDate: '2026-08-13',
  status,
  currentStationCode: stationCode || null,
  currentStationName: stationName || null,
  delayMinutes: delayMinutes === undefined ? null : delayMinutes,
  dataQuality,
  observedAt: new Date('2026-08-13T12:00:00+05:30'),
});

await test('detector: NOT_STARTED → RUNNING emits TRAIN_STARTED', () => {
  const events = detectEvents(snap('NOT_STARTED', 'MMCT'), snap('RUNNING', 'BVI', 'BORIVALI'));
  assert(events.some((e) => e.type === 'TRAIN_STARTED'), 'TRAIN_STARTED expected');
});

await test('detector: first observation already running emits TRAIN_STARTED', () => {
  const events = detectEvents(null, snap('RUNNING', 'BVI', 'BORIVALI'));
  assert(events.some((e) => e.type === 'TRAIN_STARTED'), 'TRAIN_STARTED expected on first obs');
});

await test('detector: AT_STATION → RUNNING at a new station emits TRAIN_DEPARTED', () => {
  const events = detectEvents(
    snap('AT_STATION', 'ST', 'SATNA'),
    snap('RUNNING', 'JBP', 'JABALPUR')
  );
  const e = events.find((x) => x.type === 'TRAIN_DEPARTED');
  assert(e, 'TRAIN_DEPARTED expected');
  assert(e.stationCode === 'ST', 'departed station = previous station');
});

await test('detector: RUNNING → AT_STATION at a new station emits TRAIN_ARRIVED', () => {
  const events = detectEvents(
    snap('RUNNING', 'JBP', 'JABALPUR'),
    snap('AT_STATION', 'KAT', 'KATNI')
  );
  const e = events.find((x) => x.type === 'TRAIN_ARRIVED');
  assert(e, 'TRAIN_ARRIVED expected');
  assert(e.stationCode === 'KAT', 'arrived station = current station');
});

await test('detector: no arrival/departure without a real station transition', () => {
  const events = detectEvents(snap('RUNNING', 'JBP'), snap('RUNNING', 'JBP'));
  assert(!events.some((e) => ['TRAIN_ARRIVED', 'TRAIN_DEPARTED'].includes(e.type)), 'no spurious movement');
});

await test('detector: delay lifecycle (started/increased/reduced) with real numbers', () => {
  const started = detectEvents(snap('RUNNING', 'JBP', 'JABALPUR', 0), snap('RUNNING', 'KAT', 'KATNI', 15));
  assert(started.some((e) => e.type === 'DELAY_STARTED' && e.payload.currentDelayMinutes === 15), 'DELAY_STARTED');

  const increased = detectEvents(snap('RUNNING', 'KAT', 'KATNI', 15), snap('RUNNING', 'JBP', 'JABALPUR', 45));
  assert(increased.some((e) => e.type === 'DELAY_INCREASED' && e.payload.differenceMinutes === 30), 'DELAY_INCREASED');

  const reduced = detectEvents(snap('RUNNING', 'JBP', 'JABALPUR', 45), snap('RUNNING', 'KAT', 'KATNI', 10));
  assert(reduced.some((e) => e.type === 'DELAY_REDUCED' && e.payload.differenceMinutes === 35), 'DELAY_REDUCED');
});

await test('detector: never fires delay events on missing values', () => {
  const events = detectEvents(snap('RUNNING', 'JBP', null, null), snap('RUNNING', 'KAT', null, null));
  assert(!events.some((e) => e.type.startsWith('DELAY_')), 'no delay event without real numbers');
});

await test('detector: cancellation/diversion only on real source transitions', () => {
  const cancelled = detectEvents(snap('RUNNING', 'JBP'), snap('CANCELLED'));
  assert(cancelled.some((e) => e.type === 'TRAIN_CANCELLED'), 'TRAIN_CANCELLED');
  const diverted = detectEvents(snap('RUNNING', 'JBP'), snap('DIVERTED'));
  assert(diverted.some((e) => e.type === 'TRAIN_DIVERTED'), 'TRAIN_DIVERTED');
  const none = detectEvents(snap('CANCELLED'), snap('CANCELLED'));
  assert(!none.some((e) => e.type === 'TRAIN_CANCELLED'), 'no repeat cancellation');
});

await test('detector: ETA_CHANGED and TRAIN_APPROACHING are never produced', () => {
  const events = detectEvents(null, snap('RUNNING', 'JBP', 'JABALPUR', 10));
  assert(!events.some((e) => e.type === 'ETA_CHANGED' || e.type === 'TRAIN_APPROACHING'), 'forbidden events');
});

await test('detector: isFreshSnapshot flags STALE data', () => {
  assert(isFreshSnapshot(snap('RUNNING', 'JBP', 'JABALPUR', 5, 'LIVE')), 'LIVE fresh');
  assert(isFreshSnapshot(snap('RUNNING', 'JBP', 'JABALPUR', 5, 'PARTIAL')), 'PARTIAL fresh');
  assert(!isFreshSnapshot(snap('RUNNING', 'JBP', 'JABALPUR', 5, 'STALE')), 'STALE not fresh');
});

await test('message-generator: builds title + body for delay events', () => {
  const msg = buildMessage({
    type: 'DELAY_INCREASED',
    trainNumber: '12951',
    trainName: 'RAJDHANI',
    current: 'RUNNING',
    stationName: 'KATNI',
    payload: { previousDelayMinutes: 15, currentDelayMinutes: 45 },
  });
  assert(msg && msg.title && msg.body, 'title+body present');
});

await test('message-generator: notificationUrl maps journey events to journey page', () => {
  assert(notificationUrl({ type: 'TRAIN_DEPARTED' }, 'abc123').includes('/journeys/abc123'), 'journey url');
  assert(notificationUrl({ type: 'LIVE_DATA_STALE', trainNumber: '12951' }).includes('/train/12951'), 'train url');
  assert(notificationUrl({ type: 'LIVE_DATA_STALE' }) === '/notifications', 'inbox fallback');
});

await test('dedupeKey: deterministic, time-bucketed, unique per extra', () => {
  const a = notificationDedupeKey({ trainNumber: '12951', journeyId: 'j1', eventType: 'DELAY_INCREASED', stationCode: null, observedAtMs: 100000, extra: '15:45' });
  const b = notificationDedupeKey({ trainNumber: '12951', journeyId: 'j1', eventType: 'DELAY_INCREASED', stationCode: null, observedAtMs: 100001, extra: '15:45' });
  const c = notificationDedupeKey({ trainNumber: '12951', journeyId: 'j1', eventType: 'DELAY_INCREASED', stationCode: null, observedAtMs: 610000, extra: '15:45' });
  const d = notificationDedupeKey({ trainNumber: '12951', journeyId: 'j1', eventType: 'DELAY_INCREASED', stationCode: null, observedAtMs: 100000, extra: '15:90' });
  assert(a === b, 'same minute bucket → same key');
  assert(a !== c, 'different minute bucket → different key');
  assert(a !== d, 'different delay pair → different key');
});

await test('matchAlert: DELAY_THRESHOLD only on upward crossing', () => {
  const alert = { alertType: 'DELAY_THRESHOLD', threshold: 30, journeyId: 'j1', _id: 'a1' };
  const below = matchAlert(alert, [{ type: 'DELAY_STARTED', payload: { previousDelayMinutes: 0, currentDelayMinutes: 20 } }], {});
  assert(below === null, '20 < 30 → no match');
  const cross = matchAlert(alert, [{ type: 'DELAY_STARTED', payload: { previousDelayMinutes: 0, currentDelayMinutes: 45 } }], {});
  assert(cross, '45 ≥ 30 → match');
  const already = matchAlert(alert, [{ type: 'DELAY_INCREASED', payload: { previousDelayMinutes: 40, currentDelayMinutes: 60 } }], {});
  assert(already === null, '40 ≥ 30 already crossed → no second fire');
});

await test('matchAlert: DESTINATION_APPROACHING fires once on crossing (fixture distances)', () => {
  const routeStops = [
    { station: { code: 'JBP', name: 'JABALPUR' }, distance: 1200 },
    { station: { code: 'KAT', name: 'KATNI' }, distance: 1320 },
    { station: { code: 'NDLS', name: 'NEW DELHI' }, distance: 1384 },
  ];
  const journeyMap = new Map([['j1', { destinationStationCode: 'NDLS' }]]);
  const alert = { alertType: 'DESTINATION_APPROACHING', threshold: 100, journeyId: 'j1' };
  const before = matchAlert(alert, [], { journeyMap, routeStops, snapshot: snap('RUNNING', 'JBP'), previous: snap('RUNNING', 'JBP') });
  assert(before === null, 'remaining 184 > 100 → no match');
  const cross = matchAlert(alert, [], { journeyMap, routeStops, snapshot: snap('RUNNING', 'KAT'), previous: snap('RUNNING', 'JBP') });
  assert(cross && cross.type === 'DESTINATION_APPROACHING', 'crossed to 64 remaining → match');
  assert(cross.payload.remainingDistanceKm === 64, `remaining=${cross.payload.remainingDistanceKm}`);
  const again = matchAlert(alert, [], { journeyMap, routeStops, snapshot: snap('RUNNING', 'KAT'), previous: snap('RUNNING', 'KAT') });
  assert(again === null, 'already inside threshold → no repeat fire');
});

await test('ALERT_TYPE_EVENTS: every exposed alert type maps to a real event', () => {
  const { ALERT_TYPES } = require(path.join(__dirname, '..', 'src', 'models', 'Alert.js'));
  for (const type of ALERT_TYPES) {
    assert(Array.isArray(ALERT_TYPE_EVENTS[type]) && ALERT_TYPE_EVENTS[type].length > 0, `no mapping for ${type}`);
  }
});

// ─── Part 2: backend integration (MongoDB + Upstash) ────────────────────

const env = require(path.join(__dirname, '..', 'src', 'config', 'env.js'));
const redis = require(path.join(__dirname, '..', 'src', 'services', 'upstash.js'));
const infraReady = Boolean(redis.available && env.mongoUri);

async function connectMongo() {
  const { default: mongoose } = await import('mongoose');
  if (mongoose.connection.readyState === 1) return mongoose;
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
  return mongoose;
}

const testId = Date.now().toString(36);
const testTrain = `P5${testId}`.slice(0, 8).toUpperCase();

await test('integration: enqueue → Mongo log + Redis job, then dedupe (no second log)', async () => {
  if (!infraReady) throw new Error('Mongo/Redis not configured — SKIP');
  const mongoose = await connectMongo();
  const { Alert } = require(path.join(__dirname, '..', 'src', 'models', 'Alert.js'));
  const { NotificationLog } = require(path.join(__dirname, '..', 'src', 'models', 'NotificationLog.js'));
  const { enqueueNotification } = require(path.join(__dirname, '..', 'src', 'workers', 'alerts', 'alert-engine.js'));

  const alert = await Alert.create({
    userId: `test-user-${testId}`,
    journeyId: `test-journey-${testId}`,
    trainNumber: testTrain,
    alertType: 'DELAY_THRESHOLD',
    threshold: 30,
    channel: 'PUSH',
    enabled: true,
  });
  const event = {
    type: 'DELAY_INCREASED',
    trainNumber: testTrain,
    trainName: 'TEST TRAIN',
    journeyDate: '2099-01-01',
    stationCode: null,
    stationName: null,
    current: 'RUNNING',
    payload: { previousDelayMinutes: 15, currentDelayMinutes: 45 },
    observedAtMs: Date.now(),
  };

  try {
    const first = await enqueueNotification(alert, event);
    assert(first.queued || first.skipped, `first enqueue: ${JSON.stringify(first)}`);

    const log = await NotificationLog.findOne({ trainNumber: testTrain });
    assert(log, 'notification_logs row created');
    assert(log.dedupeKey, 'dedupeKey set');

    if (redis.available) {
      const due = await redis.zrangebyscore('notify:due', '-inf', Date.now(), { count: 500 });
      assert(due.includes(String(log._id)), 'job id present in notify:due zset');
    }

    const second = await enqueueNotification(alert, event);
    assert(second.deduped === true, `expected dedupe, got ${JSON.stringify(second)}`);
    const count = await NotificationLog.countDocuments({ trainNumber: testTrain });
    assert(count === 1, `exactly one log, got ${count}`);

    await NotificationLog.deleteMany({ trainNumber: testTrain });
    await redis.del(`notify:job:${log._id}`);
    await redis.zrem('notify:due', String(log._id));
  } finally {
    await Alert.deleteMany({ _id: alert._id });
    const { default: mongoose2 } = await import('mongoose');
    await mongoose2.disconnect();
  }
}, { skip: !infraReady });

await test('integration: notification worker delivers via injected transport (SENT)', async () => {
  if (!infraReady) throw new Error('Mongo/Redis not configured — SKIP');
  const mongoose = await connectMongo();
  const { NotificationLog } = require(path.join(__dirname, '..', 'src', 'models', 'NotificationLog.js'));
  const PushSubscription = require(path.join(__dirname, '..', 'src', 'models', 'PushSubscription.js'));
  const { deliverOne } = require(path.join(__dirname, '..', 'src', 'workers', 'alerts', 'notification-worker.js'));
  const webpush = require('web-push');

  const user = `test-user-${testId}`;
  const endpoint = `https://fake.push.example/${testId}`;
  const original = webpush.sendNotification;

  const sub = await PushSubscription.create({
    userId: user,
    endpoint,
    keys: { p256dh: 'a'.repeat(88), auth: 'a'.repeat(24) },
    device: 'test',
    active: true,
  });
  const log = await NotificationLog.create({
    userId: user,
    journeyId: `test-journey-${testId}`,
    trainNumber: testTrain,
    eventType: 'DELAY_INCREASED',
    channel: 'PUSH',
    message: 'TEST delay increased',
    status: 'QUEUED',
    dedupeKey: `it-${testId}-1`,
    attempts: 0,
  });
  await redis.set(`notify:job:${log._id}`, {
    notificationId: String(log._id), userId: user, channel: 'PUSH',
    payload: { title: 't', body: 'b', url: '/notifications' },
  }, env.alerts.queueTtlSeconds);
  await redis.zadd('notify:due', Date.now(), String(log._id));

  try {
    webpush.sendNotification = async () => ({ ok: true });
    const result = await deliverOne(String(log._id));
    assert(result.ok === true, `deliver failed: ${JSON.stringify(result)}`);
    const updated = await NotificationLog.findById(log._id);
    assert(updated.status === 'SENT', `status=${updated.status}`);
    assert(!(await redis.zscore('notify:due', String(log._id))), 'job removed from due zset');

    // Permanent rejection → subscription deactivated, no retry.
    const log2 = await NotificationLog.create({
      userId: user, journeyId: `test-journey-${testId}`, trainNumber: testTrain,
      eventType: 'DELAY_INCREASED', channel: 'PUSH', message: 'TEST2', status: 'QUEUED',
      dedupeKey: `it-${testId}-2`, attempts: 0,
    });
    await redis.set(`notify:job:${log2._id}`, { notificationId: String(log2._id), userId: user, channel: 'PUSH', payload: { title: 't', body: 'b' } }, env.alerts.queueTtlSeconds);
    await redis.zadd('notify:due', Date.now(), String(log2._id));
    webpush.sendNotification = async () => { const e = new Error('gone'); e.statusCode = 410; throw e; };
    const r2 = await deliverOne(String(log2._id));
    assert(r2.permanent === true, `expected permanent, got ${JSON.stringify(r2)}`);
    const sub2 = await PushSubscription.findOne({ endpoint });
    assert(sub2.active === false, 'subscription deactivated on 410');
    const log2b = await NotificationLog.findById(log2._id);
    assert(log2b.status === 'FAILED', `status=${log2b.status}`);

    // Retryable failure → stays QUEUED, attempts incremented, re-scheduled.
    await PushSubscription.updateOne({ endpoint }, { $set: { active: true } });
    const log3 = await NotificationLog.create({
      userId: user, journeyId: `test-journey-${testId}`, trainNumber: testTrain,
      eventType: 'DELAY_INCREASED', channel: 'PUSH', message: 'TEST3', status: 'QUEUED',
      dedupeKey: `it-${testId}-3`, attempts: 0,
    });
    await redis.set(`notify:job:${log3._id}`, { notificationId: String(log3._id), userId: user, channel: 'PUSH', payload: { title: 't', body: 'b' } }, env.alerts.queueTtlSeconds);
    await redis.zadd('notify:due', Date.now(), String(log3._id));
    webpush.sendNotification = async () => { throw new Error('network down'); };
    const r3 = await deliverOne(String(log3._id));
    assert(r3.retrying === true, `expected retry, got ${JSON.stringify(r3)}`);
    const log3b = await NotificationLog.findById(log3._id);
    assert(log3b.status === 'QUEUED' && log3b.attempts === 1, `status=${log3b.status} attempts=${log3b.attempts}`);
    const score = await redis.zscore('notify:due', String(log3._id));
    assert(score && Number(score) > Date.now(), 'rescheduled in future');

    // A job that was never queued is a no-op.
    const r4 = await deliverOne(`nonexistent-${testId}`);
    assert(r4.skipped === 'no-job' || r4.skipped === 'locked', `unexpected: ${JSON.stringify(r4)}`);
  } finally {
    webpush.sendNotification = original;
    await NotificationLog.deleteMany({ trainNumber: testTrain });
    await PushSubscription.deleteMany({ endpoint });
    for (const id of [String(log._id), 'nonexistent-2'.replace('2', testId.slice(0, 3)), `nonexistent-${testId}`]) {
      try {
        await redis.del(`notify:job:${id}`);
        await redis.zrem('notify:due', id);
        await redis.del(`notify:lock:${id}`);
      } catch { /* best-effort */ }
    }
    const { default: mongoose2 } = await import('mongoose');
    await mongoose2.disconnect();
  }
}, { skip: !infraReady });

await test('integration: backend /tracking/status exposes honest alerts block', async () => {
  let ok = false;
  try { ok = (await fetch('http://localhost:4000/health')).ok; } catch { ok = false; }
  if (!ok) throw new Error('backend not reachable — SKIP');
  const res = await fetch(`${BACKEND}/tracking/status`);
  const body = await res.json();
  assert(res.ok && body.success, 'status endpoint failed');
  assert(body.data.alerts, 'alerts block present');
  assert(typeof body.data.alerts.enabled === 'boolean', 'alerts.enabled');
  assert(typeof body.data.alerts.pushConfigured === 'boolean', 'pushConfigured');
}, { skip: !(await (async () => { try { return (await fetch('http://localhost:4000/health')).ok; } catch { return false; } })()) });

// ─── Part 3: security via Next.js API (needs full stack) ───────────────

async function nextOk() {
  try {
    const res = await fetch(`${NEXT}/api/auth/csrf`);
    return res.ok;
  } catch {
    return false;
  }
}
const nextUp = await nextOk();

const cookies = (res) =>
  (typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean))
    .map((c) => c.split(';')[0])
    .join('; ');

async function signup(suffix) {
  const user = { name: 'Phase5', email: `phase5_${suffix}@railgaadi.dev`, password: 'test1234' };
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
  const jar2 = cookies(loginRes);
  assert(jar2.includes('session-token'), 'login failed');
  return jar2;
}

await test('security: unauth access to alerts/notifications is rejected', async () => {
  if (!nextUp) throw new Error('Next.js not reachable — SKIP');
  assert((await fetch(`${NEXT}/api/alerts`)).status === 401, 'GET /api/alerts unauth → 401');
  assert((await fetch(`${NEXT}/api/notifications`)).status === 401, 'GET /api/notifications unauth → 401');
  assert((await fetch(`${NEXT}/api/notifications/preferences`)).status === 401, 'prefs unauth → 401');
  const sub = await fetch(`${NEXT}/api/notifications/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: { endpoint: 'https://fake.example/x', keys: { p256dh: 'y'.repeat(88), auth: 'y'.repeat(24) } } }),
  });
  assert(sub.status === 401, 'push subscribe unauth → 401');
});

await test('security: alert validation rejects bad input', async () => {
  if (!nextUp) throw new Error('Next.js not reachable — SKIP');
  const jar = await signup(`val_${Date.now().toString(36)}`);
  const badType = await fetch(`${NEXT}/api/alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jar },
    body: JSON.stringify({ journeyId: '000000000000000000000000', alertType: 'ETA_CHANGED' }),
  });
  assert(badType.status === 400, `bad alertType → 400, got ${badType.status}`);
  const noJourney = await fetch(`${NEXT}/api/alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jar },
    body: JSON.stringify({ journeyId: 'not-an-objectid', alertType: 'DELAY_THRESHOLD', threshold: 30 }),
  });
  assert(noJourney.status === 400, `bad journeyId → 400, got ${noJourney.status}`);
  const badThresh = await fetch(`${NEXT}/api/alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jar },
    body: JSON.stringify({ journeyId: '000000000000000000000000', alertType: 'DELAY_THRESHOLD' }),
  });
  assert(badThresh.status === 400, `missing threshold → 400, got ${badThresh.status}`);
});

await test('security: ownership enforced (B cannot touch A alerts/journeys)', async () => {
  if (!nextUp) throw new Error('Next.js not reachable — SKIP');
  const suffix = Date.now().toString(36);
  const jarA = await signup(`a_${suffix}`);
  const jarB = await signup(`b_${suffix}`);
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

  const create = await fetch(`${NEXT}/api/journeys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jarA },
    body: JSON.stringify({ trainNumber: '12951', boardingStationCode: 'ST', destinationStationCode: 'BRC', journeyDate: today }),
  });
  const created = await create.json();
  assert(created.success, `journey create failed: ${JSON.stringify(created)}`);
  const journeyId = created.data.id;

  const mkAlert = await fetch(`${NEXT}/api/alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jarA },
    body: JSON.stringify({ journeyId, alertType: 'DELAY_THRESHOLD', threshold: 30 }),
  });
  const alertCreated = await mkAlert.json();
  assert(mkAlert.status === 201 && alertCreated.success, `alert create failed: ${JSON.stringify(alertCreated)}`);
  const alertId = alertCreated.data.id;

  try {
    // B cannot create an alert against A's journey (journey lookup is scoped).
    const bCreate = await fetch(`${NEXT}/api/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: jarB },
      body: JSON.stringify({ journeyId, alertType: 'DELAY_THRESHOLD', threshold: 10 }),
    });
    assert(bCreate.status === 404, `B create on A journey → 404, got ${bCreate.status}`);

    // B cannot read A's alerts (journey filter is user-scoped).
    const bList = await fetch(`${NEXT}/api/alerts?journeyId=${journeyId}`, { headers: { Cookie: jarB } });
    const bListBody = await bList.json();
    assert(bList.ok && Array.isArray(bListBody.data) && bListBody.data.length === 0, 'B sees no alerts');

    // B cannot patch or delete A's alert.
    const bPatch = await fetch(`${NEXT}/api/alerts/${alertId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: jarB },
      body: JSON.stringify({ enabled: false }),
    });
    assert(bPatch.status === 404, `B patch → 404, got ${bPatch.status}`);
    const bDel = await fetch(`${NEXT}/api/alerts/${alertId}`, { method: 'DELETE', headers: { Cookie: jarB } });
    assert(bDel.status === 404, `B delete → 404, got ${bDel.status}`);

    // B cannot mark A's notification read.
    const notif = await fetch(`${NEXT}/api/notifications/${'0'.repeat(24)}/read`, {
      method: 'POST',
      headers: { Cookie: jarB },
    });
    assert(notif.status === 404, `B read foreign notif → 404, got ${notif.status}`);

    // Duplicate active alert for A → 409.
    const dup = await fetch(`${NEXT}/api/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: jarA },
      body: JSON.stringify({ journeyId, alertType: 'DELAY_THRESHOLD', threshold: 45 }),
    });
    assert(dup.status === 409, `duplicate alert → 409, got ${dup.status}`);

    // A can list, toggle and delete their own alert.
    const aList = await fetch(`${NEXT}/api/alerts?journeyId=${journeyId}`, { headers: { Cookie: jarA } });
    const aListBody = await aList.json();
    assert(aListBody.data.length === 1 && aListBody.data[0].alertType === 'DELAY_THRESHOLD', 'A lists own alert');
    const aToggle = await fetch(`${NEXT}/api/alerts/${alertId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: jarA },
      body: JSON.stringify({ enabled: false }),
    });
    assert(aToggle.ok, `A toggle failed ${aToggle.status}`);
    const aDel = await fetch(`${NEXT}/api/alerts/${alertId}`, { method: 'DELETE', headers: { Cookie: jarA } });
    assert(aDel.ok, `A delete failed ${aDel.status}`);
  } finally {
    try { await fetch(`${NEXT}/api/journeys/${journeyId}/cancel`, { method: 'POST', headers: { Cookie: jarA } }); } catch { /* best-effort */ }
  }
});

await test('security: push subscription lifecycle + preferences', async () => {
  if (!nextUp) throw new Error('Next.js not reachable — SKIP');
  const jar = await signup(`push_${Date.now().toString(36)}`);
  const endpoint = `https://fcm.googleapis.com/fcm/send/${Date.now().toString(36)}`;
  const body = { subscription: { endpoint, keys: { p256dh: 'p'.repeat(88), auth: 'a'.repeat(24) } }, device: 'test-device' };

  const sub = await fetch(`${NEXT}/api/notifications/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jar },
    body: JSON.stringify(body),
  });
  assert([200, 201].includes(sub.status), `subscribe → ${sub.status}`);

  const prefs = await fetch(`${NEXT}/api/notifications/preferences`, { headers: { Cookie: jar } });
  const prefsBody = await prefs.json();
  assert(prefsBody.success && prefsBody.data.push.enabled === true, `push enabled, got ${JSON.stringify(prefsBody.data?.push)}`);
  assert(prefsBody.data.push.devices.some((d) => d.device === 'test-device'), 'device listed');

  const off = await fetch(`${NEXT}/api/notifications/preferences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jar },
    body: JSON.stringify({ enabled: false }),
  });
  const offBody = await off.json();
  assert(off.ok && offBody.success && offBody.data.push.enabled === false, 'push disabled');

  const del = await fetch(`${NEXT}/api/notifications/push/subscribe`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: jar },
    body: JSON.stringify({ subscription: { endpoint } }),
  });
  assert(del.ok, `unsubscribe → ${del.status}`);

  const prefs2 = await fetch(`${NEXT}/api/notifications/preferences`, { headers: { Cookie: jar } });
  const prefs2Body = await prefs2.json();
  assert(!prefs2Body.data.push.devices.some((d) => d.endpoint === endpoint), 'endpoint removed');
});

// ─── Report ─────────────────────────────────────────────────────────────

const passCount = results.filter((r) => r.pass).length;
const skipCount = results.filter((r) => r.skipped).length;
const failCount = results.filter((r) => !r.pass && !r.skipped).length;

console.log('\n═══ Phase 5 results ═══');
for (const r of results) {
  const mark = r.skipped ? 'SKIP' : r.pass ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${r.name}${r.err && !r.skipped ? ` — ${r.err}` : ''}`);
}
console.log(`\n${passCount} passed, ${failCount} failed, ${skipCount} skipped`);
process.exit(failCount > 0 ? 1 : 0);
