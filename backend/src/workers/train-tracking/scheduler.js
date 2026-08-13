const config = require('../../config/env');
const redis = require('../../services/upstash');
const Journey = require('../../models/Journey');
const TrainSnapshot = require('../../models/TrainSnapshot');
const { KEYS, PRIORITY } = require('./types');
const { ensureTarget, schedule, markCompleted, loadTarget } = require('./tracker');
const metrics = require('./metrics');
const { istDateString } = require('./ist-dates');

const BATCH = 100;

/**
 * PLANNED journeys only have a date (YYYY-MM-DD), not a departure time. The
 * prestart window (TRAIN_TRACKING_PRESTART_MINUTES, default 180) is therefore
 * approximated as: PLANNED journeys whose journeyDate is TODAY (IST) are
 * eligible for prestart tracking. Journey-date-only data — deterministic.
 */
function isInPrestartWindow(journeyDate) {
  return typeof journeyDate === 'string' && journeyDate === istDateString(new Date());
}

async function activeSetSize() {
  return redis.available ? redis.scard(KEYS.active).catch(() => 0) : 0;
}

/**
 * Discover journeys that need tracking and (re)ensure their targets.
 * Paginated, idempotent, respects the MAX_TARGETS cap. Never deletes existing
 * target state.
 */
async function discoverAndSchedule() {
  let discovered = 0;
  let scheduled = 0;
  let cursor = null;
  const cap = config.tracking.maxTargets;

  // Phase 1: every ACTIVE journey is tracked now (priority active).
  // Phase 2: PLANNED journeys departing today are pre-warmed (priority prestart).
  const phases = [
    { status: 'ACTIVE', priority: PRIORITY.ACTIVE },
    { status: 'PLANNED', priority: PRIORITY.PRESTART },
  ];

  for (const phase of phases) {
    cursor = null;
    const filter = { status: phase.status };
    if (phase.status === 'PLANNED') {
      filter.journeyDate = istDateString(new Date());
    }
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const query = Journey.find(filter).sort({ _id: 1 }).limit(BATCH);
      if (cursor) query.gt({ _id: cursor });
      const rows = await query.lean().exec();
      if (!rows || rows.length === 0) break;

      for (const journey of rows) {
        if (discovered >= cap) break;
        discovered += 1;
        const target = await ensureTarget({
          trainNumber: journey.trainNumber,
          journeyDate: journey.journeyDate,
          priority: phase.priority,
          journeyId: journey._id.toString(),
        });
        if (target.nextFetchAt === null || target.nextFetchAt <= Date.now()) {
          await schedule(target, Date.now());
          scheduled += 1;
        }
      }
      cursor = rows[rows.length - 1]._id;
      if (rows.length < BATCH || discovered >= cap) break;
    }
    if (discovered >= cap) break;
  }

  await metrics.markTargetsDiscovered(discovered);
  return { discovered, scheduled };
}

/**
 * Retire targets that no journey needs anymore. Called after discovery each
 * cycle: when no ACTIVE journey (and no PLANNED-today prestart journey)
 * references a target, polling it is pure quota waste — mark it completed and
 * drop it from the active set / due queue (spec §8 target lifecycle).
 */
async function reconcileActiveTargets() {
  if (!redis.available) return 0;
  const activeIds = await redis.smembers(KEYS.active).catch(() => []);
  let retired = 0;
  for (const targetId of activeIds) {
    const target = await loadTarget(targetId);
    if (!target) continue;
    const activeCount = await Journey.countDocuments({
      trainNumber: target.trainNumber,
      journeyDate: target.journeyDate,
      status: 'ACTIVE',
    }).catch(() => 1);
    let prestartCount = 0;
    if (target.priority === PRIORITY.PRESTART) {
      prestartCount = await Journey.countDocuments({
        trainNumber: target.trainNumber,
        journeyDate: target.journeyDate,
        status: 'PLANNED',
      }).catch(() => 1);
    }
    if (activeCount === 0 && prestartCount === 0) {
      await markCompleted(target, { journeyIds: [] });
      await redis.del(KEYS.target(targetId));
      retired += 1;
    }
  }
  return retired;
}

async function runRetentionCleanup() {
  const days = config.tracking.snapshotRetentionDays;
  if (!(days > 0)) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  const res = await TrainSnapshot.deleteMany({ observedAt: { $lt: cutoff } });
  if (res.deletedCount > 0) {
    await metrics.markCleanup(res.deletedCount);
  }
  return res.deletedCount || 0;
}

async function maybeCleanup() {
  if (!redis.available) return runRetentionCleanup();
  const last = await redis.get(KEYS.lastCleanup).catch(() => null);
  const lastMs = last && Number(last) ? Number(last) : 0;
  if (Date.now() - lastMs < 24 * 3600 * 1000) return 0;
  const removed = await runRetentionCleanup();
  await redis.set(KEYS.lastCleanup, Date.now(), 7 * 24 * 3600);
  return removed;
}

module.exports = { discoverAndSchedule, reconcileActiveTargets, runRetentionCleanup, maybeCleanup };
