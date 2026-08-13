// Alert evaluation engine (Phase 5 §22, §41).
//
// Runs inside the Phase 4 worker. Given a freshly persisted REAL snapshot:
//   1. load the previous real snapshot,
//   2. detect real events (transitions between the two),
//   3. load ONLY the alerts attached to this train/journey (never "every
//      alert against every train"),
//   4. evaluate rules, and
//   5. enqueue a notification job for each match (Redis + MongoDB dedupe).
//
// It never fabricates data and never fetches train data itself beyond the
// cached schedule lookup needed for destination-approaching distances.

const config = require('../../config/env');
const redis = require('../../services/upstash');
const TrainSnapshot = require('../../models/TrainSnapshot');
const Journey = require('../../models/Journey');
const { Alert } = require('../../models/Alert');
const { NotificationLog, NOTIFICATION_STATUS } = require('../../models/NotificationLog');
const { KEYS, TARGET_STATUS } = require('../train-tracking/types');
const { loadTarget } = require('../train-tracking/tracker');
const { isStrongCompletionEvidence } = require('../train-tracking/normalizer');
const { getTrainDetails } = require('../../services/railradar');
const { detectEvents, isFreshSnapshot } = require('./event-detector');
const { NOTIFY_KEYS, ALERT_TYPE_EVENTS, notificationDedupeKey } = require('./types');
const { buildMessage, notificationUrl } = require('./message-generator');
const { isChannelConfigured } = require('./notification-provider');
const metrics = require('./metrics');

function obsMs(snapshot) {
  return snapshot && snapshot.observedAt ? snapshot.observedAt.getTime() : Date.now();
}

async function findPreviousSnapshot(snapshot, currentId) {
  return TrainSnapshot.findOne({
    trainNumber: snapshot.trainNumber,
    journeyDate: snapshot.journeyDate,
    _id: { $ne: currentId },
  })
    .sort({ observedAt: -1, _id: -1 })
    .lean()
    .catch(() => null);
}

function safeNum(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function findStop(route, stationCode) {
  if (!Array.isArray(route)) return null;
  const code = String(stationCode || '').toUpperCase();
  if (!code) return null;
  return (
    route.find((s) => String(s.station?.code || s.stationCode || '').toUpperCase() === code) || null
  );
}

async function getRouteStops(trainNumber) {
  try {
    const details = await getTrainDetails(trainNumber);
    return Array.isArray(details && details.route) ? details.route : null;
  } catch {
    return null;
  }
}

// ─── Stale / recovered episodes (per tracking target) ────────────────────

async function handleStale(target, snapshot) {
  if (!redis.available) return null;
  const flagKey = NOTIFY_KEYS.stale(target.targetId);
  const flag = await redis.get(flagKey);
  const fresh = isFreshSnapshot(snapshot);

  if (fresh) {
    if (flag) {
      await redis.del(flagKey);
      return {
        type: 'LIVE_DATA_RECOVERED',
        trainNumber: snapshot.trainNumber,
        trainName: snapshot.trainName || null,
        journeyDate: snapshot.journeyDate,
        stationCode: null,
        stationName: null,
        current: snapshot.status,
        payload: { recoveredAfterMs: Date.now() - (flag.since || Date.now()) },
        observedAtMs: obsMs(snapshot),
      };
    }
    return null;
  }

  if (!flag) {
    await redis.set(flagKey, { since: Date.now() }, config.alerts.queueTtlSeconds);
    await metrics.markStaleEvent();
    return {
      type: 'LIVE_DATA_STALE',
      trainNumber: snapshot.trainNumber,
      trainName: snapshot.trainName || null,
      journeyDate: snapshot.journeyDate,
      stationCode: null,
      stationName: null,
      current: snapshot.status,
      payload: { dataQuality: 'STALE', episodeBucket: Math.floor(Date.now() / 300000) },
      observedAtMs: obsMs(snapshot),
    };
  }
  return null;
}

// ─── Destination approaching (real schedule distances + real current stop) ─

function computeDestinationApproaching(alert, { journey, routeStops, snapshot, previous }) {
  if (!journey || !routeStops) return null;
  const destCode = String(journey.destinationStationCode || '');
  const destStop = findStop(routeStops, destCode);
  const currStop = findStop(routeStops, snapshot && snapshot.currentStationCode);
  if (!destStop || !currStop) return null;

  const destDist = safeNum(destStop.distance);
  const currDist = safeNum(currStop.distance);
  if (destDist === null || currDist === null || currDist > destDist) return null;

  const remaining = destDist - currDist;
  const threshold = typeof alert.threshold === 'number' && alert.threshold > 0 ? alert.threshold : 10;
  if (remaining > threshold) return null;

  // Crossing-based: only fire when the train crossed the threshold NOW.
  let prevRemaining = null;
  if (previous && previous.currentStationCode) {
    const prevStop = findStop(routeStops, previous.currentStationCode);
    const prevDist = prevStop ? safeNum(prevStop.distance) : null;
    if (prevDist !== null && prevDist <= destDist) prevRemaining = destDist - prevDist;
  }
  if (prevRemaining !== null && prevRemaining <= threshold) return null;

  return {
    type: 'DESTINATION_APPROACHING',
    trainNumber: snapshot.trainNumber,
    trainName: snapshot.trainName || null,
    journeyDate: snapshot.journeyDate,
    journeyId: alert.journeyId,
    stationCode: destCode,
    stationName: String(destStop.station?.name || destStop.stationName || destCode),
    current: snapshot.status,
    payload: {
      remainingDistanceKm: Math.max(0, Math.round(remaining)),
      threshold,
      destinationStationCode: destCode,
    },
    observedAtMs: obsMs(snapshot),
  };
}

// ─── Rule matching ───────────────────────────────────────────────────────

function passesThreshold(alert, event) {
  const p = (event && event.payload) || {};
  const threshold = typeof alert.threshold === 'number' ? alert.threshold : 0;
  switch (alert.alertType) {
    case 'DELAY_THRESHOLD': {
      const prev = p.previousDelayMinutes;
      const curr = p.currentDelayMinutes;
      return prev < threshold && curr >= threshold;
    }
    case 'DELAY_INCREASE':
    case 'DELAY_REDUCTION':
      return (p.differenceMinutes || 0) >= threshold;
    default:
      return true;
  }
}

function matchAlert(alert, events, ctx) {
  if (alert.alertType === 'DESTINATION_APPROACHING') {
    const journey = ctx.journeyMap && ctx.journeyMap.get(alert.journeyId);
    return computeDestinationApproaching(alert, { journey, ...ctx });
  }
  const types = ALERT_TYPE_EVENTS[alert.alertType] || [];
  for (const event of events) {
    if (!types.includes(event.type)) continue;
    if (event.journeyId != null && String(event.journeyId) !== alert.journeyId) continue;
    if (!passesThreshold(alert, event)) continue;
    return event;
  }
  return null;
}

async function matchAndEnqueue(alerts, events, ctx) {
  let evaluated = 0;
  let matched = 0;
  for (const alert of alerts) {
    evaluated += 1;
    const event = matchAlert(alert, events, ctx);
    if (event) {
      matched += 1;
      await enqueueNotification(alert, event);
    }
  }
  await metrics.markAlertsEvaluated(evaluated);
  return { evaluated, matched };
}

// ─── Notification enqueue (queue + dedupe + log) ─────────────────────────

function dedupeExtra(alert, event) {
  const p = (event && event.payload) || {};
  if (alert.alertType === 'DELAY_THRESHOLD' || alert.alertType === 'DELAY_INCREASE' || alert.alertType === 'DELAY_REDUCTION') {
    return `${p.previousDelayMinutes}:${p.currentDelayMinutes}`;
  }
  if (alert.alertType === 'DESTINATION_APPROACHING') {
    return `t${p.threshold}`;
  }
  if (event.type === 'LIVE_DATA_STALE') {
    return `e${p.episodeBucket || ''}`;
  }
  return '';
}

async function enqueueNotification(alert, event) {
  const message = buildMessage(event);
  if (!message) return { skipped: 'no-message' };

  const channel = alert.channel || 'PUSH';
  const configured = isChannelConfigured(channel);
  const url = notificationUrl(event, alert.journeyId);
  const dedupeKey = notificationDedupeKey({
    trainNumber: event.trainNumber || alert.trainNumber,
    journeyId: alert.journeyId,
    eventType: event.type,
    stationCode: event.stationCode,
    observedAtMs: event.observedAtMs,
    extra: dedupeExtra(alert, event),
  });

  // Layer 1: Redis SETNX (fast, cross-instance). Layer 2: unique Mongo index.
  if (redis.available) {
    const acquired = await redis.setnx(NOTIFY_KEYS.dedupe(dedupeKey), '1', config.alerts.dedupeTtlSeconds);
    if (!acquired) {
      await metrics.markDuplicatePrevented();
      return { deduped: true };
    }
  }

  const now = new Date();
  const logDoc = {
    userId: alert.userId,
    journeyId: alert.journeyId,
    trainNumber: event.trainNumber || alert.trainNumber,
    trainName: event.trainName || null,
    eventType: event.type,
    channel,
    message: message.body,
    status: configured ? NOTIFICATION_STATUS.QUEUED : NOTIFICATION_STATUS.SKIPPED,
    error: configured ? null : `${channel} channel is not configured`,
    dedupeKey,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const log = await NotificationLog.create(logDoc);
    if (configured) {
      const job = {
        notificationId: String(log._id),
        userId: alert.userId,
        journeyId: alert.journeyId,
        trainNumber: logDoc.trainNumber,
        trainName: logDoc.trainName,
        eventType: event.type,
        channel,
        payload: { title: message.title, body: message.body, url },
        createdAt: now.toISOString(),
        attempts: 0,
      };
      await redis.set(NOTIFY_KEYS.job(String(log._id)), job, config.alerts.queueTtlSeconds);
      await redis.zadd(NOTIFY_KEYS.due, Date.now(), String(log._id));
      await metrics.markQueued();
    } else {
      await metrics.markSkipped();
    }
    await Alert.updateOne(
      { _id: alert._id },
      { $set: { lastTriggeredAt: now, updatedAt: now }, $inc: { triggerCount: 1 } }
    );
    return { queued: configured, skipped: !configured };
  } catch (err) {
    if (err && err.code === 11000) {
      await metrics.markDuplicatePrevented();
      return { deduped: true };
    }
    throw err;
  }
}

// ─── Public entry points ─────────────────────────────────────────────────

/**
 * Run after a NEW snapshot was persisted for `target`.
 */
async function runAlertPipeline(target, snapshot, currentId) {
  if (!config.alerts.enabled) return { evaluated: 0, matched: 0, events: 0 };
  const result = { evaluated: 0, matched: 0, events: 0 };
  try {
    const previous = await findPreviousSnapshot(snapshot, currentId);
    const events = detectEvents(previous, snapshot);
    const stale = await handleStale(target, snapshot);
    if (stale) events.push(stale);
    result.events = events.length;
    await metrics.markEventDetected(events.length);

    const journeys = await Journey.find({
      trainNumber: target.trainNumber,
      journeyDate: target.journeyDate,
      status: 'ACTIVE',
    })
      .select({ _id: 1, destinationStationCode: 1, userId: 1 })
      .limit(50);
    if (!journeys.length) return result;

    const journeyMap = new Map(journeys.map((j) => [j._id.toString(), j]));
    for (const journey of journeys) {
      if (isStrongCompletionEvidence(snapshot, journey.destinationStationCode)) {
        events.push({
          type: 'JOURNEY_COMPLETED',
          trainNumber: snapshot.trainNumber,
          trainName: snapshot.trainName || null,
          journeyDate: snapshot.journeyDate,
          journeyId: journey._id.toString(),
          stationCode: snapshot.currentStationCode,
          stationName: snapshot.currentStationName,
          current: snapshot.status,
          payload: {},
          observedAtMs: obsMs(snapshot),
        });
      }
    }

    const alerts = await Alert.find({ journeyId: { $in: [...journeyMap.keys()] }, enabled: true })
      .lean()
      .limit(200);
    if (!alerts.length) return result;

    const needsRoute = alerts.some((a) => a.alertType === 'DESTINATION_APPROACHING');
    const routeStops = needsRoute ? await getRouteStops(target.trainNumber) : null;

    const outcome = await matchAndEnqueue(alerts, events, { journeyMap, routeStops, snapshot, previous });
    result.evaluated = outcome.evaluated;
    result.matched = outcome.matched;
    return result;
  } catch (err) {
    metrics.memory.lastError = String(err && err.message || err).slice(0, 300);
    return { ...result, error: true };
  }
}

/**
 * Periodic check for targets that stopped producing fresh data (quota/failure
 * means no snapshot is even fetched, so the pipeline above never runs). Fires
 * LIVE_DATA_STALE once per stale episode, per target (§16).
 */
async function checkStaleTargets() {
  if (!config.alerts.enabled || !redis.available) return 0;
  const activeIds = await redis.smembers(KEYS.active).catch(() => []);
  let fired = 0;
  for (const targetId of activeIds) {
    const target = await loadTarget(targetId);
    if (!target || target.status === TARGET_STATUS.COMPLETED) continue;

    const flagKey = NOTIFY_KEYS.stale(targetId);
    if (await redis.get(flagKey)) continue;

    const lastSnapshotAt = target.lastSnapshotAt ? Date.parse(target.lastSnapshotAt) : null;
    const thresholdMs = config.alerts.staleThresholdSeconds * 1000;
    const behind = lastSnapshotAt ? Date.now() - lastSnapshotAt > thresholdMs : false;
    const failing = target.status === 'STALE' || target.status === 'ERROR';
    if (!behind && !(failing && !lastSnapshotAt)) continue;

    await redis.set(flagKey, { since: Date.now() }, config.alerts.queueTtlSeconds);
    await metrics.markStaleEvent();
    const event = {
      type: 'LIVE_DATA_STALE',
      trainNumber: target.trainNumber,
      trainName: target.trainName || null,
      journeyDate: target.journeyDate,
      stationCode: null,
      stationName: null,
      current: target.status,
      payload: { dataQuality: 'STALE', episodeBucket: Math.floor(Date.now() / 300000) },
      observedAtMs: Date.now(),
    };

    const journeys = await Journey.find({
      trainNumber: target.trainNumber,
      journeyDate: target.journeyDate,
      status: 'ACTIVE',
    })
      .select({ _id: 1 })
      .limit(50);
    if (!journeys.length) continue;

    const journeyMap = new Map(journeys.map((j) => [j._id.toString(), j]));
    const alerts = await Alert.find({
      journeyId: { $in: [...journeyMap.keys()] },
      enabled: true,
      alertType: 'LIVE_DATA_STALE',
    })
      .lean()
      .limit(50);
    if (!alerts.length) continue;

    await matchAndEnqueue(alerts, [event], { journeyMap });
    fired += 1;
  }
  return fired;
}

module.exports = { runAlertPipeline, checkStaleTargets, enqueueNotification, matchAlert, computeDestinationApproaching };
