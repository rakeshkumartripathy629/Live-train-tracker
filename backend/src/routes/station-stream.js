// Phase 8 §42 — SSE live station stream.
//
// Same design as the Phase 7 journey stream (in-process event bus + Redis
// reconcile + heartbeat + connection caps), but for a PUBLIC station feed:
//   - auth is the shared internal token only (the Next.js proxy owns the token,
//     the browser never sees it); no user/journey ownership is required because
//     the data is public board information,
//   - events are published by station-events.js from the SAME real snapshots
//     that drive the alert engine (alerts integration),
//   - initial state replays the last real event kept in Redis per station.

const { Router } = require('express');
const config = require('../config/env');
const redis = require('../services/upstash');
const { subscribe } = require('../services/event-bus');
const {
  STATION_TOPIC,
  STATION_LAST_KEY,
  STATION_EVENT_NAMES,
} = require('../services/station-events');

const router = Router();

const perStationConnections = new Map();
let globalConnections = 0;
const connections = new Set();

function internalToken() {
  return config.internalToken;
}

function fail(res, status, message, code) {
  return res.status(status).json({ success: false, error: message, code });
}

function requireToken(req, res, next) {
  if (!internalToken()) {
    return fail(res, 404, 'Stream endpoint is not enabled', 'STREAM_NOT_ENABLED');
  }
  if (req.get('x-internal-token') !== internalToken()) {
    return fail(res, 401, 'Invalid internal token', 'UNAUTHORIZED');
  }
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

router.get('/:code', requireToken, async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!code || !/^[A-Z0-9]{2,5}$/.test(code)) {
    return fail(res, 400, 'Invalid station code', 'INVALID_STATION_CODE');
  }

  if (globalConnections >= config.sse.maxConnections) {
    return fail(res, 429, 'Live stream capacity reached, try again later', 'CAPACITY_REACHED');
  }
  const perStation = perStationConnections.get(code) || new Set();
  if (perStation.size >= config.sse.maxConnectionsPerUser) {
    return fail(res, 429, 'Too many live streams for this station', 'TOO_MANY_STREAMS');
  }

  sseSetup(res);

  const epoch = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  let seq = 0;
  let closed = false;
  let lastDeliveredObservedAtMs = 0;

  const writeFrame = (event, data, id) => {
    if (closed || res.writableEnded || res.destroyed) return false;
    const frameId = id !== undefined ? id : `${epoch}-${++seq}`;
    try {
      return res.write(`id: ${frameId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      return false;
    }
  };

  const heartbeat = () => {
    if (closed || res.writableEnded) return;
    try {
      res.write(': heartbeat\n\n');
    } catch {
      /* connection already gone */
    }
  };

  globalConnections += 1;
  perStation.add(res);
  perStationConnections.set(code, perStation);
  connections.add(res);

  const last = await redis.get(STATION_LAST_KEY(code));
  if (!closed) {
    if (last && STATION_EVENT_NAMES[last.type]) {
      writeFrame('initial-state', { ...last, source: 'SSE' });
      const t = last.observedAt ? Date.parse(last.observedAt) : 0;
      if (Number.isFinite(t)) lastDeliveredObservedAtMs = t;
    } else {
      writeFrame('initial-state', {
        type: 'STATION_INITIAL_STATE',
        station: { code, name: null },
        liveEvents: [],
        observedAt: new Date().toISOString(),
        source: 'SSE',
      });
    }
  }

  const topic = STATION_TOPIC(code);
  const unsubscribe = subscribe(topic, (payload) => {
    if (!payload || closed) return;
    const eventName = STATION_EVENT_NAMES[payload.type];
    if (!eventName) return;
    if (writeFrame(eventName, payload)) {
      const t = payload.observedAt ? Date.parse(payload.observedAt) : 0;
      if (Number.isFinite(t)) lastDeliveredObservedAtMs = Math.max(lastDeliveredObservedAtMs, t);
    }
  });

  const heartbeatHandle = setInterval(heartbeat, config.sse.heartbeatSeconds * 1000);
  heartbeatHandle.unref?.();

  // Redis reconcile: replays the newest real station event across instances and
  // recovers anything missed while reconnecting.
  const reconcileHandle = setInterval(async () => {
    try {
      const snap = await redis.get(STATION_LAST_KEY(code));
      if (!snap || !STATION_EVENT_NAMES[snap.type]) return;
      const t = snap.observedAt ? Date.parse(snap.observedAt) : 0;
      if (Number.isFinite(t) && t > lastDeliveredObservedAtMs) {
        writeFrame(STATION_EVENT_NAMES[snap.type], snap);
        lastDeliveredObservedAtMs = t;
      }
    } catch {
      /* best-effort */
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
    perStation.delete(res);
    if (perStation.size === 0) perStationConnections.delete(code);
    globalConnections = Math.max(0, globalConnections - 1);
  }

  res.on('close', closeConnection);
  res.on('finish', closeConnection);
  res.on('error', closeConnection);
  req.on('close', closeConnection);
});

function closeAll() {
  for (const res of [...connections]) {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
  connections.clear();
  perStationConnections.clear();
  globalConnections = 0;
}

module.exports = { router, closeAll };
