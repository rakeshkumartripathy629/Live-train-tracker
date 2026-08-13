// Phase 7 SSE live-train stream.
//
//  - Lives in the persistent backend (single Express process in Docker), never
//    in serverless frontend handlers.
//  - Authenticates via the internal token (X-Internal-Token) plus the verified
//    journey owner (X-Journey-User) — the frontend proxy guarantees both.
//  - Primary delivery: in-process event bus (worker → subscribers) in the same
//    Node process.
//  - Safety net: reconciles against the shared Redis snapshot
//    (tracking:last:{targetId}) on an interval so missed events are replayed
//    and future multi-instance deployments converge.
//  - Every event carries a monotonic id, a heartbeat keeps the connection
//    alive through proxies, and all connections are cleaned up on close/abort
//    and on server shutdown.

const { Router } = require('express');
const mongoose = require('mongoose');
const config = require('../config/env');
const redis = require('../services/upstash');
const { subscribe, totalListeners } = require('../services/event-bus');
const { SSE_EVENT_NAMES, topicOf, eventPayload } = require('../services/train-events');
const { KEYS, targetIdOf } = require('../workers/train-tracking/types');
const metrics = require('../services/stream-metrics');
const Journey = require('../models/Journey');

const router = Router();

const perUserConnections = new Map();
let globalConnections = 0;
const connections = new Set();

function internalToken() {
  return config.internalToken;
}

function unauthorized(res, message, code) {
  return res.status(401).json({ success: false, error: message, code });
}

function fail(res, status, message, code) {
  return res.status(status).json({ success: false, error: message, code });
}

async function requireStreamAuth(req, res, next) {
  if (!internalToken()) {
    return fail(res, 404, 'Stream endpoint is not enabled', 'STREAM_NOT_ENABLED');
  }
  if (req.get('x-internal-token') !== internalToken()) {
    return unauthorized(res, 'Invalid internal token', 'UNAUTHORIZED');
  }
  const userId = req.get('x-journey-user');
  if (!userId || String(userId).trim() === '') {
    return fail(res, 400, 'Missing journey owner header', 'MISSING_USER');
  }
  const journeyId = req.params.journeyId;
  if (!journeyId || !mongoose.Types.ObjectId.isValid(journeyId)) {
    return fail(res, 400, 'Invalid journey id', 'INVALID_JOURNEY');
  }
  let journey;
  try {
    journey = await Journey.findById(journeyId).lean();
  } catch {
    journey = null;
  }
  if (!journey) return fail(res, 404, 'Journey not found', 'NOT_FOUND');
  if (String(journey.userId) !== String(userId)) {
    return fail(res, 403, 'You do not have access to this journey', 'FORBIDDEN');
  }
  req.streamJourney = journey;
  req.streamUser = String(userId);
  return next();
}

function sseSetup(res) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
}

function eventIdPrefix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function readLastSnapshot(targetId) {
  try {
    const snap = await redis.get(KEYS.last(targetId));
    return snap && snap.trainNumber ? snap : null;
  } catch {
    return null;
  }
}

async function fetchLiveSnapshot(trainNumber, journeyDate) {
  try {
    const { getLiveJourney } = require('../services/railradar');
    const { normalizeLiveTrainResponse } = require('../workers/train-tracking/normalizer');
    const raw = await getLiveJourney(trainNumber);
    const snapshot = normalizeLiveTrainResponse(raw, { trainNumber, journeyDate });
    return snapshot && snapshot.trainNumber ? snapshot : null;
  } catch {
    return null;
  }
}

function staleObservedAt(payload) {
  if (!payload || !payload.observedAt) return false;
  const t = Date.parse(payload.observedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > config.alerts.staleThresholdSeconds * 1000;
}

// Keep the route out of the shared public API limiter: a single long-lived SSE
// request should not count as 120 rapid-fire requests. Each new connection is
// still subject to the per-user/global caps below.
router.get('/journey/:journeyId', requireStreamAuth, async (req, res) => {
  const journey = req.streamJourney;
  const userId = req.streamUser;
  const journeyId = String(journey._id);

  const userSet = perUserConnections.get(userId) || new Set();
  if (userSet.size >= config.sse.maxConnectionsPerUser) {
    return fail(res, 429, 'Too many live streams for this account', 'TOO_MANY_STREAMS');
  }
  if (globalConnections >= config.sse.maxConnections) {
    return fail(res, 429, 'Live stream capacity reached, try again later', 'CAPACITY_REACHED');
  }

  sseSetup(res);

  const epoch = eventIdPrefix();
  let seq = 0;
  let closed = false;
  let lastDeliveredObservedAtMs = 0;
  let staleReported = false;

  const writeFrame = (event, data, id) => {
    if (closed || res.writableEnded || res.destroyed) return false;
    const frameId = id !== undefined ? id : `${epoch}-${++seq}`;
    const startedAt = Date.now();
    let ok = true;
    try {
      ok = res.write(`id: ${frameId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      ok = false;
    }
    metrics.track(event, { delivered: ok ? 1 : 0, dropped: ok ? 0 : 1, latencyMs: Date.now() - startedAt });
    return ok;
  };

  const heartbeat = () => {
    if (closed || res.writableEnded) return;
    try {
      res.write(': heartbeat\n\n');
    } catch {
      /* connection already gone */
    }
  };

  const sendPayload = (event, payload) => {
    if (writeFrame(event, payload)) {
      if (payload && payload.observedAt) {
        const t = Date.parse(payload.observedAt);
        if (Number.isFinite(t)) lastDeliveredObservedAtMs = Math.max(lastDeliveredObservedAtMs, t);
      }
      return true;
    }
    return false;
  };

  const targetId = targetIdOf(journey.trainNumber, journey.journeyDate);

  // Register connection (counted after the auth gates above).
  globalConnections += 1;
  perUserConnections.set(userId, userSet);
  userSet.add(res);
  connections.add(res);
  metrics.activeConnections = globalConnections;
  metrics.opened += 1;
  const lastEventId = req.get('last-event-id');
  if (lastEventId) metrics.reconnects += 1;

  // Initial state — from the shared Redis last-snapshot first (the durable
  // source), else the shared 30s live cache (never a per-client RailRadar hit).
  const lastSnap = await readLastSnapshot(targetId);
  let initial = lastSnap
    ? { ...eventPayload(lastSnap), trainName: lastSnap.trainName || null }
    : null;
  if (!initial) {
    const fresh = await fetchLiveSnapshot(journey.trainNumber, journey.journeyDate);
    if (fresh) initial = { ...eventPayload(fresh), trainName: fresh.trainName || null };
  }

  if (closed) return;

  if (initial) {
    sendPayload('initial-state', { ...initial, source: 'SSE' });
  } else {
    sendPayload('error', { type: 'LIVE_STREAM_UNAVAILABLE', message: 'No live data for this train yet' });
  }

  // Initial-stale announcement: a snapshot older than the stale threshold is
  // reported once; the worker's TRACKING_RECOVERED clears it when fresh data
  // arrives.
  if (initial && staleObservedAt(initial)) {
    staleReported = true;
    sendPayload('tracking-stale', {
      type: 'TRACKING_STALE',
      trainNumber: journey.trainNumber,
      journeyDate: journey.journeyDate,
      observedAt: new Date().toISOString(),
      dataQuality: 'STALE',
    });
  }

  const topic = topicOf(journey.trainNumber, journey.journeyDate);
  const unsubscribe = subscribe(topic, (payload) => {
    if (!payload || closed) return;
    if (payload.type === 'TRACKING_STALE') {
      if (staleReported) return;
      staleReported = true;
      sendPayload(SSE_EVENT_NAMES.TRACKING_STALE, payload);
      return;
    }
    if (payload.type === 'TRACKING_RECOVERED') {
      staleReported = false;
      sendPayload(SSE_EVENT_NAMES.TRACKING_RECOVERED, payload);
      return;
    }
    const eventName = SSE_EVENT_NAMES[payload.type];
    if (!eventName) return;
    if (staleReported) {
      staleReported = false;
      sendPayload(SSE_EVENT_NAMES.TRACKING_RECOVERED, {
        type: 'TRACKING_RECOVERED',
        trainNumber: journey.trainNumber,
        journeyDate: journey.journeyDate,
        observedAt: new Date().toISOString(),
        dataQuality: 'PARTIAL',
      });
    }
    sendPayload(eventName, payload);
    if (payload.type === 'JOURNEY_COMPLETED') {
      setTimeout(closeConnection, 50);
    }
  });

  const heartbeatHandle = setInterval(heartbeat, config.sse.heartbeatSeconds * 1000);
  heartbeatHandle.unref?.();

  // Redis reconcile: replays the newest durable snapshot for missed events and
  // for cross-instance convergence (the primary delivery is the in-process bus).
  const reconcileHandle = setInterval(async () => {
    try {
      const snap = await readLastSnapshot(targetId);
      if (!snap) return;
      const t = snap.observedAt ? Date.parse(snap.observedAt) : 0;
      if (Number.isFinite(t) && t > lastDeliveredObservedAtMs) {
        sendPayload(SSE_EVENT_NAMES.TRAIN_UPDATE, { ...eventPayload(snap), trainName: snap.trainName || null });
      }
    } catch {
      /* reconcile is best-effort */
    }
  }, config.sse.redisSyncSeconds * 1000);
  reconcileHandle.unref?.();

  function closeConnection() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeatHandle);
    clearInterval(reconcileHandle);
    unsubscribe();
    try {
      res.end();
    } catch {
      /* already ended */
    }
    connections.delete(res);
    userSet.delete(res);
    if (userSet.size === 0) perUserConnections.delete(userId);
    globalConnections = Math.max(0, globalConnections - 1);
    metrics.activeConnections = globalConnections;
    metrics.closed += 1;
  }

  res.on('close', closeConnection);
  res.on('finish', closeConnection);
  res.on('error', closeConnection);
  req.on('close', closeConnection);
});

router.get('/metrics', (req, res) => {
  if (!internalToken() || req.get('x-internal-token') !== internalToken()) {
    return unauthorized(res, 'Invalid internal token', 'UNAUTHORIZED');
  }
  return res.json({
    success: true,
    data: {
      activeConnections: metrics.activeConnections,
      opened: metrics.opened,
      closed: metrics.closed,
      reconnects: metrics.reconnects,
      liveSubscribers: totalListeners(),
      lastError: metrics.lastError,
      events: metrics.snapshot(),
    },
  });
});

// Close every open stream (server shutdown / graceful restart).
function closeAll() {
  for (const res of [...connections]) {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
  connections.clear();
  perUserConnections.clear();
  globalConnections = 0;
  metrics.activeConnections = 0;
}

module.exports = { router, closeAll, metrics };
