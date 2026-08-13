// Standalone tracking + notification worker process. Run:  node src/worker.js
// Connects to MongoDB, syncs indexes, then runs the scheduler + fetch loop and
// the notification delivery loop until SIGTERM/SIGINT.

const config = require('./config/env');
const { connectDb } = require('./config/db');
const TrainSnapshot = require('./models/TrainSnapshot');
const metrics = require('./workers/train-tracking/metrics');
const { startWorker, stopWorker } = require('./workers/train-tracking/worker');
const {
  startNotificationWorker,
  stopNotificationWorker,
} = require('./workers/alerts/notification-worker');

async function main() {
  console.log('[worker] starting (tracking enabled=%s, interval=%ss, scheduler=%ss, concurrency=%d, maxTargets=%d, alerts enabled=%s)',
    config.tracking.enabled, config.tracking.intervalSeconds, config.tracking.schedulerSeconds,
    config.tracking.concurrency, config.tracking.maxTargets, config.alerts.enabled);

  await connectDb();
  try {
    const { Alert } = require('./models/Alert');
    const { NotificationLog } = require('./models/NotificationLog');
    const PushSubscription = require('./models/PushSubscription');
    await Promise.all([
      TrainSnapshot.syncIndexes(),
      Alert.syncIndexes(),
      NotificationLog.syncIndexes(),
      PushSubscription.syncIndexes(),
    ]);
    console.log('[worker] indexes synced');
  } catch (err) {
    console.error('[worker] index sync failed:', err.message);
  }

  if (!config.tracking.enabled) {
    console.log('[worker] TRAIN_TRACKING_ENABLED=false — exiting without starting the loop');
    process.exit(0);
  }

  startWorker();
  metrics.setStatus('running');
  console.log('[worker] tracking loop started');

  if (config.alerts.enabled) {
    startNotificationWorker();
    console.log('[worker] notification loop started');
  }

  const shutdown = async (signal) => {
    console.log(`[worker] ${signal} received, shutting down`);
    stopWorker();
    stopNotificationWorker();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
