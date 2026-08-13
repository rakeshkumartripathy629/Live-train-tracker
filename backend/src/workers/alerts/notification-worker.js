// Notification worker (Phase 5 §23, §41–§43). Consumes JOBS from the Redis
// queue — it never fetches train data itself. Delivery is idempotent: the
// notification_logs doc is the source of truth for status, the Redis zset only
// schedules when a retry is due.

const config = require('../../config/env');
const redis = require('../../services/upstash');
const lock = require('../train-tracking/lock');
const { NOTIFY_KEYS } = require('./types');
const { NotificationLog, NOTIFICATION_STATUS } = require('../../models/NotificationLog');
const { createProvider } = require('./notification-provider');
const metrics = require('./metrics');

const provider = createProvider();

function retryBackoffMs(attempt) {
  const base = Math.max(1, config.alerts.retryBaseSeconds) * 1000;
  return Math.min(600000, base * Math.pow(2, Math.max(0, attempt - 1)));
}

async function saveJob(id, job) {
  if (redis.available) {
    await redis.set(NOTIFY_KEYS.job(id), job, config.alerts.queueTtlSeconds);
  }
}

async function loadJob(id) {
  if (redis.available) {
    const job = await redis.get(NOTIFY_KEYS.job(id));
    if (job) return job;
  }
  const log = await NotificationLog.findById(id).lean().catch(() => null);
  if (!log) return null;
  return {
    notificationId: String(log._id),
    userId: log.userId,
    journeyId: log.journeyId,
    trainNumber: log.trainNumber,
    trainName: log.trainName,
    eventType: log.eventType,
    channel: log.channel,
    payload: { message: log.message, title: log.message, url: '/notifications' },
    createdAt: log.createdAt,
    attempts: log.attempts || 0,
  };
}

async function deliverOne(id) {
  // Cross-instance safety: one worker delivers a given job at a time.
  const token = await lock.acquire(id);
  if (!token) return { skipped: 'locked' };

  try {
    const job = await loadJob(id);
    if (!job) {
      await redis.zrem(NOTIFY_KEYS.due, id);
      return { skipped: 'no-job' };
    }

    const log = await NotificationLog.findById(id).catch(() => null);
    if (!log || log.status === 'SENT' || log.status === 'SKIPPED') {
      await redis.zrem(NOTIFY_KEYS.due, id);
      return { skipped: 'terminal' };
    }

    await NotificationLog.updateOne({ _id: id }, { $set: { status: NOTIFICATION_STATUS.SENDING, updatedAt: new Date() } });

    const startedAt = Date.now();
    const result = await provider.send({
      channel: job.channel || log.channel || 'PUSH',
      userId: job.userId,
      payload: {
        title: job.payload && job.payload.title,
        body: job.payload && job.payload.body,
        url: job.payload && job.payload.url,
      },
    });
    await metrics.addProviderLatency(Date.now() - startedAt);

    if (result.status === 'SENT') {
      await NotificationLog.updateOne(
        { _id: id },
        {
          $set: {
            status: NOTIFICATION_STATUS.SENT,
            providerMessageId: result.providerMessageId || null,
            error: null,
            sentAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );
      await metrics.markSent();
      await redis.zrem(NOTIFY_KEYS.due, id);
      return { ok: true };
    }

    if (result.status === 'SKIPPED') {
      await NotificationLog.updateOne(
        { _id: id },
        { $set: { status: NOTIFICATION_STATUS.SKIPPED, error: result.error, updatedAt: new Date() } }
      );
      await metrics.markSkipped();
      await redis.zrem(NOTIFY_KEYS.due, id);
      return { skipped: result.error };
    }

    // FAILED. Permanent → stop retrying; temporary → limited backoff retries.
    const attempts = (log.attempts || 0) + 1;
    if (result.permanent || attempts >= config.alerts.maxRetries) {
      await NotificationLog.updateOne(
        { _id: id },
        { $set: { status: NOTIFICATION_STATUS.FAILED, error: result.error, attempts, updatedAt: new Date() } }
      );
      await metrics.markFailed();
      await redis.zrem(NOTIFY_KEYS.due, id);
      return { error: result.error, permanent: true };
    }

    await NotificationLog.updateOne(
      { _id: id },
      { $set: { status: NOTIFICATION_STATUS.QUEUED, error: result.error, attempts, updatedAt: new Date() } }
    );
    job.attempts = attempts;
    await saveJob(id, job);
    const retryAt = Date.now() + retryBackoffMs(attempts);
    await redis.zadd(NOTIFY_KEYS.due, retryAt, id);
    return { error: result.error, retrying: true, retryAt };
  } finally {
    await lock.release(id, token);
  }
}

async function runOnce(limit = 50) {
  if (!redis.available) return { processed: 0, reason: 'redis-unavailable' };
  const due = await redis.zrangebyscore(NOTIFY_KEYS.due, '-inf', Date.now(), { count: limit });
  if (!due.length) return { processed: 0 };
  let processed = 0;
  for (const id of due) {
    await deliverOne(id);
    processed += 1;
  }
  return { processed };
}

let intervalHandle = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await runOnce();
  } catch (err) {
    metrics.memory.lastError = String(err && err.message || err).slice(0, 300);
  } finally {
    running = false;
  }
}

function startNotificationWorker() {
  if (intervalHandle) return;
  const ms = Math.max(1000, config.alerts.workerIntervalSeconds * 1000);
  tick();
  intervalHandle = setInterval(tick, ms);
  intervalHandle.unref?.();
  metrics.setStatus('running');
}

function stopNotificationWorker() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  metrics.setStatus('stopped');
}

module.exports = {
  startNotificationWorker,
  stopNotificationWorker,
  runOnce,
  deliverOne,
  createProvider,
  retryBackoffMs,
};
