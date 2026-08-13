const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const { getLiveJourney } = require('../services/railradar');
const { normalizeLiveTrainResponse } = require('../workers/train-tracking/normalizer');
const { persistSnapshot, applyToJourneys } = require('../workers/train-tracking/tracker');
const { emptyTarget } = require('../workers/train-tracking/types');
const { istDateString } = require('../workers/train-tracking/ist-dates');
const metrics = require('../workers/train-tracking/metrics');

const router = Router();

// Health/status: reports the TRUE worker state. "unknown"/"stopped" when the
// worker is not running — never a fake healthy response (spec §35).
router.get('/status', async (req, res) => {
  const info = await metrics.snapshot().catch(() => ({
    workerStatus: metrics.memory.workerStatus,
    counters: {},
  }));
  const alertInfo = await require('../workers/alerts/metrics')
    .snapshot()
    .catch(() => ({ workerStatus: 'stopped', counters: {} }));
  res.json({
    success: true,
    data: {
      tracking: {
        enabled: config.tracking.enabled,
        intervalSeconds: config.tracking.intervalSeconds,
        schedulerSeconds: config.tracking.schedulerSeconds,
        prestartMinutes: config.tracking.prestartMinutes,
        concurrency: config.tracking.concurrency,
        maxTargets: config.tracking.maxTargets,
        snapshotRetentionDays: config.tracking.snapshotRetentionDays,
        redisAvailable: require('../services/upstash').available,
      },
      worker: info,
      alerts: {
        enabled: config.alerts.enabled,
        staleThresholdSeconds: config.alerts.staleThresholdSeconds,
        workerIntervalSeconds: config.alerts.workerIntervalSeconds,
        maxRetries: config.alerts.maxRetries,
        pushConfigured: require('../workers/alerts/notification-provider').isChannelConfigured('PUSH'),
        ...alertInfo,
      },
    },
  });
});

// Internal, token-protected one-shot tracking test. Real RailRadar call only —
// never dummy data (spec §36, §21). Enabled only when INTERNAL_API_TOKEN is set.
const internalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ success: false, error: 'Too many internal test requests', code: 'RATE_LIMITED' }),
});

router.post('/internal/tracking/test', internalLimiter, async (req, res, next) => {
  try {
    if (!config.internalToken) {
      return res.status(404).json({ success: false, error: 'Internal endpoint not enabled', code: 'NOT_ENABLED' });
    }
    if (req.get('x-internal-token') !== config.internalToken) {
      return res.status(401).json({ success: false, error: 'Invalid internal token', code: 'UNAUTHORIZED' });
    }
    const trainNumber = String((req.body && req.body.trainNumber) || '').replace(/[^0-9]/g, '');
    if (!/^\d{4,5}$/.test(trainNumber)) {
      return res.status(400).json({ success: false, error: 'Valid trainNumber required', code: 'INVALID_TRAIN_NUMBER' });
    }
    const journeyDate = String((req.body && req.body.journeyDate) || '').trim() || istDateString(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(journeyDate)) {
      return res.status(400).json({ success: false, error: 'journeyDate must be YYYY-MM-DD', code: 'INVALID_DATE' });
    }

    // One full pipeline pass: real fetch → strict normalize → persist → journey update.
    const raw = await getLiveJourney(trainNumber);
    const snapshot = normalizeLiveTrainResponse(raw, { trainNumber, journeyDate });
    if (!snapshot.trainNumber) {
      return res.status(404).json({ success: false, error: 'Live data missing train identity', code: 'TRAIN_NOT_FOUND' });
    }

    const result = await persistSnapshot(snapshot);
    const target = emptyTarget(trainNumber, journeyDate, 'active', null);
    await applyToJourneys(target, snapshot);

    res.json({
      success: true,
      data: {
        trainNumber: snapshot.trainNumber,
        journeyDate: snapshot.journeyDate,
        written: result.written,
        deduped: Boolean(result.deduped),
        snapshot: {
          status: snapshot.status,
          currentStationCode: snapshot.currentStationCode,
          currentStationName: snapshot.currentStationName,
          delayMinutes: snapshot.delayMinutes,
          platform: snapshot.platform,
          completionFraction: snapshot.completionFraction,
          dataQuality: snapshot.dataQuality,
          observedAt: snapshot.observedAt.toISOString(),
          fetchedAt: snapshot.fetchedAt.toISOString(),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
