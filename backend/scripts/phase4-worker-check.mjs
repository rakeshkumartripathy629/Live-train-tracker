// Phase 4 worker-path verification — runs the REAL scheduler + worker modules
// directly (no HTTP/Next). Creates an ACTIVE journey in the real DB, lets the
// worker discover + fetch + applyToJourneys, then reports and cleans up.
// Run from backend/:  node scripts/phase4-worker-check.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const up = (p) => path.join(__dirname, '..', 'src', p);

const mongoose = (await import('mongoose')).default;
const { default: config } = await import('../src/config/env.js');
const { istDateString } = require(up('workers/train-tracking/ist-dates.js'));
const { discoverAndSchedule, maybeCleanup } = require(up('workers/train-tracking/scheduler.js'));
const { processDueTargets } = require(up('workers/train-tracking/worker.js'));
const { loadTarget } = require(up('workers/train-tracking/tracker.js'));
const redis = require(up('services/upstash.js'));
const metrics = require(up('workers/train-tracking/metrics.js'));

const today = istDateString(new Date());
const USER_ID = 'phase4-worker-check';
const TRAIN = '12951';

async function main() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;

  const doc = {
    userId: USER_ID,
    trainNumber: TRAIN,
    trainName: 'TEST JOURNEY (worker check)',
    origin: { code: 'MMCT', name: 'MUMBAI CENTRAL' },
    destination: { code: 'NDLS', name: 'NEW DELHI' },
    boardingStationCode: 'ST',
    boardingStationName: 'SURAT',
    destinationStationCode: 'BRC',
    destinationStationName: 'VADODARA JN',
    journeyDate: today,
    status: 'ACTIVE',
    startedAt: new Date(),
    completedAt: null,
    lastTrackedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const res = await db.collection('journeys').insertOne(doc);
  const journeyId = res.insertedId.toString();
  console.log('[check] inserted ACTIVE journey', journeyId, '12951', today);

  console.log('[check] discoverAndSchedule ...');
  const disc = await discoverAndSchedule();
  console.log('[check] discovery:', JSON.stringify(disc));

  const target = await loadTarget(`${TRAIN}:${today}`);
  console.log('[check] target:', JSON.stringify(target && {
    targetId: target.targetId, status: target.status, priority: target.priority,
    nextFetchAt: target.nextFetchAt, lastFetchedAt: target.lastFetchedAt, attempts: target.attempts,
  }));

  console.log('[check] processDueTargets ...');
  const processed = await processDueTargets();
  console.log('[check] processed:', processed);

  // Give one fetch cycle a chance if the target wasn't due yet.
  for (let i = 0; i < 3; i++) {
    const t = await loadTarget(`${TRAIN}:${today}`);
    if (t && t.lastFetchedAt) break;
    console.log('[check] waiting 5s for a fetch cycle ...');
    await new Promise((r) => setTimeout(r, 5000));
    await processDueTargets();
  }

  const after = await db.collection('journeys').findOne({ _id: res.insertedId });
  const snaps = await db.collection('trainsnapshots').countDocuments({ trainNumber: TRAIN, journeyDate: today });
  const stats = await metrics.snapshot();
  console.log('[check] journey.lastTrackedAt =', after ? after.lastTrackedAt : 'MISSING');
  console.log('[check] journey.status =', after ? after.status : 'MISSING');
  console.log('[check] snapshots for', TRAIN, today, '=', snaps);
  console.log('[check] worker counters:', JSON.stringify(stats.counters));
  console.log('[check] worker lastError:', stats.lastError);

  const ok = after && after.lastTrackedAt && snaps >= 1;
  console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');

  // Cleanup: cancel the test journey so the worker stops polling it.
  await db.collection('journeys').updateOne(
    { _id: res.insertedId },
    { $set: { status: 'CANCELLED', updatedAt: new Date() } }
  );
  await redis.del(`tracking:target:${TRAIN}:${today}`);
  await redis.zrem('tracking:due', `${TRAIN}:${today}`);
  await redis.srem('tracking:active', `${TRAIN}:${today}`);
  console.log('[check] cleaned up test journey');
  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[check] FATAL:', err);
  process.exit(1);
});
