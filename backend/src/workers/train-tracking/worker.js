const config = require('../../config/env');
const redis = require('../../services/upstash');
const { getLiveJourney } = require('../../services/railradar');
const lock = require('./lock');
const { KEYS, TARGET_STATUS, backoffMs } = require('./types');
const { loadTarget, schedule, setTargetStatus, markCompleted, persistSnapshot, applyToJourneys } = require('./tracker');
const { normalizeLiveTrainResponse } = require('./normalizer');
const metrics = require('./metrics');
const { discoverAndSchedule, reconcileActiveTargets, maybeCleanup } = require('./scheduler');
const { runAlertPipeline, checkStaleTargets } = require('../alerts/alert-engine');
const { publishSnapshot, publishTrackingState } = require('../../services/train-events');
const { ingestStationObservations } = require('../stations/station-observations');
const { publishStationEvents } = require('../../services/station-events');

const intervalMs = () => config.tracking.intervalSeconds * 1000;

async function processTarget(targetId) {
  const target = await loadTarget(targetId);
  if (!target || target.status === TARGET_STATUS.COMPLETED) {
    await redis.zrem(KEYS.due, targetId);
    return null;
  }

  // Capture the pre-fetch health so TRACKING_RECOVERED fires only on the
  // STALE/ERROR → ACTIVE transition (never repeatedly).
  const wasStale = target.status === TARGET_STATUS.STALE || target.status === TARGET_STATUS.ERROR;

  // Cross-instance safety: only one worker fetches a target at a time.
  const token = await lock.acquire(targetId);
  if (!token) return { skipped: 'locked' };

  try {
    // Redundant-fetch guard: never fetch more often than the interval.
    const lastFetchedAt = target.lastFetchedAt ? Date.parse(target.lastFetchedAt) : null;
    if (lastFetchedAt && Date.now() - lastFetchedAt < intervalMs() * 0.8) {
      await redis.zrem(KEYS.due, targetId);
      await schedule(target, lastFetchedAt + intervalMs());
      return { skipped: 'recent' };
    }

    await redis.zrem(KEYS.due, targetId);
    await setTargetStatus(target, TARGET_STATUS.FETCHING);

    const startedAt = Date.now();
    try {
      // Real RailRadar data (shared 30s Redis live-cache with the public API).
      const raw = await getLiveJourney(target.trainNumber);
      const snapshot = normalizeLiveTrainResponse(raw, {
        trainNumber: target.trainNumber,
        journeyDate: target.journeyDate,
      });

      if (!snapshot.trainNumber) {
        throw new Error('Live response missing train identity');
      }

      // Cross-instance dedup guard before hitting the DB.
      const lastSnap = await redis.get(KEYS.last(target.targetId));
      let persist = { written: false };
      if (lastSnap && lastSnap.dedupKey === snapshot.dedupKey) {
        await metrics.markDedupPrevented();
      } else {
        persist = await persistSnapshot(snapshot);
        if (persist.written) {
          await redis.set(KEYS.last(target.targetId), snapshot, intervalMs() + 60);
        }
      }

      await applyToJourneys(target, snapshot);

      // Phase 5: only a genuinely new observation can carry an event. The
      // alert pipeline compares it with the previous real snapshot and enqueues
      // notifications for matching user alerts (§22).
      if (persist.written) {
        try {
          await runAlertPipeline(target, snapshot, persist.snapshotId);
        } catch (err) {
          metrics.memory.lastError = `[alerts] ${String(err && err.message || err).slice(0, 300)}`;
        }

        // Phase 8: persist REAL station observations (same snapshots the alert
        // engine consumes) and publish per-station SSE events. Both are
        // best-effort — they never break the tracking cycle.
        try {
          await ingestStationObservations(lastSnap || null, snapshot);
        } catch (err) {
          metrics.memory.lastError = `[stations] ${String(err && err.message || err).slice(0, 300)}`;
        }
        try {
          await publishStationEvents(lastSnap || null, snapshot);
        } catch (err) {
          metrics.memory.lastError = `[station-stream] ${String(err && err.message || err).slice(0, 300)}`;
        }

        // Phase 7: publish real-time SSE events. Recovery is announced first
        // (§19 order), then the full update + focused change events.
        try {
          if (wasStale) publishTrackingState(target, 'TRACKING_RECOVERED');
          publishSnapshot(target, snapshot, lastSnap || null);
        } catch (err) {
          metrics.memory.lastError = `[stream] ${String(err && err.message || err).slice(0, 300)}`;
        }
      }

      const now = new Date();
      target.attempts = 0;
      target.lastError = null;
      target.lastFetchedAt = now.toISOString();
      target.lastSnapshotAt = now.toISOString();
      await setTargetStatus(target, TARGET_STATUS.ACTIVE);
      await schedule(target, Date.now() + intervalMs());

      await metrics.markSuccess();
      await metrics.addLatency(Date.now() - startedAt);
      return { ok: true, status: snapshot.status };
    } catch (err) {
      const isQuota = err && err.name === 'RailRadarError' && (err.status === 429 || err.code === 'TOO_MANY_REQUESTS');
      const isTimeout = err && err.name === 'AbortError';
      target.attempts = (target.attempts || 0) + 1;
      target.lastError = String(err && err.message || err).slice(0, 300);

      if (isQuota) {
        await metrics.markRateLimited();
        await setTargetStatus(target, TARGET_STATUS.STALE);
        if (!wasStale) {
          try {
            publishTrackingState(target, 'TRACKING_STALE');
          } catch (err) {
            metrics.memory.lastError = `[stream] ${String(err && err.message || err).slice(0, 300)}`;
          }
        }
        await schedule(target, Date.now() + 5 * 60 * 1000);
      } else {
        if (isTimeout) await metrics.markTimeout();
        await metrics.markFailure();
        const status = target.attempts > config.tracking.maxRetries ? TARGET_STATUS.ERROR : TARGET_STATUS.STALE;
        await setTargetStatus(target, status);
        if (status === TARGET_STATUS.STALE && !wasStale) {
          try {
            publishTrackingState(target, 'TRACKING_STALE');
          } catch (err) {
            metrics.memory.lastError = `[stream] ${String(err && err.message || err).slice(0, 300)}`;
          }
        }
        await schedule(target, Date.now() + backoffMs(target.attempts, intervalMs()));
      }
      return { error: true };
    }
  } finally {
    await lock.release(targetId, token);
  }
}

// Run a list of async jobs with at most `limit` concurrent executions.
async function runPool(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function processDueTargets() {
  const due = await redis.zrangebyscore(KEYS.due, '-inf', Date.now());
  if (!due.length) return 0;
  const results = await runPool(due, config.tracking.concurrency, (id) => processTarget(id));
  return results.filter(Boolean).length;
}

let cycleRunning = false;
let intervalHandle = null;

async function runCycle() {
  if (cycleRunning) return;
  cycleRunning = true;
  const startMs = Date.now();
  try {
    await discoverAndSchedule();
    await reconcileActiveTargets();
    await processDueTargets();
    await checkStaleTargets();
    await maybeCleanup();
  } catch (err) {
    metrics.memory.lastError = String(err && err.message || err).slice(0, 300);
  } finally {
    cycleRunning = false;
    await metrics.endCycle(startMs);
  }
}

function startWorker() {
  if (intervalHandle) return;
  const ms = Math.max(1000, intervalMs());
  runCycle();
  intervalHandle = setInterval(runCycle, ms);
  intervalHandle.unref?.();
  metrics.setStatus('running');
}

function stopWorker() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  metrics.setStatus('stopped');
}

module.exports = { startWorker, stopWorker, runCycle, processTarget, processDueTargets };
