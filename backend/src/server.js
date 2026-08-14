const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config/env');
const { connectDb } = require('./config/db');
const { notFound, errorHandler } = require('./middleware/error');

const trainsRouter = require('./routes/trains');
const stationsRouter = require('./routes/stations');
const pnrRouter = require('./routes/pnr');
const alarmsRouter = require('./routes/alarms');
const userRouter = require('./routes/user');
const trackingRouter = require('./routes/tracking');
const streamRouter = require('./routes/stream');
const stationStreamRouter = require('./routes/station-stream');
const aiRouter = require('./routes/ai');
const { seedStationsFromRailRadar } = require('./services/stations');
const { startWorker, stopWorker } = require('./workers/train-tracking/worker');
const {
  startNotificationWorker,
  stopNotificationWorker,
} = require('./workers/alerts/notification-worker');

const app = express();

// ─── Middleware ─────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(morgan(config.isProd ? 'combined' : 'dev'));

app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() },
  });
});

// ─── API Routes ─────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, slow down' },
});

app.use('/api/v1', apiLimiter);
app.use('/api/v1/trains', trainsRouter);
app.use('/api/v1/stations', stationsRouter);
app.use('/api/v1/pnr', pnrRouter);
app.use('/api/v1/alarms', alarmsRouter);
app.use('/api/v1/user', userRouter);
app.use('/api/v1/tracking', trackingRouter);
app.use('/api/v1/ai', aiRouter);
if (config.sse.enabled) {
  app.use('/api/v1/stream', streamRouter.router);
  app.use('/api/v1/stream/station', stationStreamRouter.router);
  console.log(
    `[stream] SSE enabled (heartbeat=${config.sse.heartbeatSeconds}s, redisSync=${config.sse.redisSyncSeconds}s, maxPerUser=${config.sse.maxConnectionsPerUser}, maxGlobal=${config.sse.maxConnections})`
  );
}
app.get('/api/v1/push-key', (req, res) => {
  res.json({ success: true, data: { publicKey: config.vapid.publicKey || null } });
});

app.use(notFound);
app.use(errorHandler);

// ─── Start ──────────────────────────────────────────────────────────────
async function start() {
  const db = await connectDb().catch(() => null);

  const server = app.listen(config.port, () => {
    console.log(`[server] RailGaadi API running on http://localhost:${config.port} (${config.nodeEnv})`);
  });

  // Background alarm checker — runs every 60s once DB is available.
  if (db) {
    setInterval(async () => {
      try {
        await alarmsRouter.checkAlarms();
      } catch (err) {
        console.error('[alarms] check failed:', err.message);
      }
    }, 60 * 1000);
    console.log('[alarms] background checker enabled (every 60s)');
  }

  // Phase 4 live tracking worker — runs alongside the API server.
  if (db && config.tracking.enabled) {
    try {
      const TrainSnapshot = require('./models/TrainSnapshot');
      await TrainSnapshot.syncIndexes();
      console.log('[tracking] train_snapshots indexes synced');
    } catch (err) {
      console.error('[tracking] index sync failed:', err.message);
    }
    startWorker();
    console.log(
      `[tracking] worker enabled (interval=${config.tracking.intervalSeconds}s, scheduler=${config.tracking.schedulerSeconds}s, concurrency=${config.tracking.concurrency}, maxTargets=${config.tracking.maxTargets})`
    );
  } else if (!config.tracking.enabled) {
    console.log('[tracking] worker disabled (TRAIN_TRACKING_ENABLED=false)');
  }

  // Phase 5 alert/notification engine.
  if (db) {
    try {
      const { Alert } = require('./models/Alert');
      const { NotificationLog } = require('./models/NotificationLog');
      const PushSubscription = require('./models/PushSubscription');
      await Promise.all([
        Alert.syncIndexes(),
        NotificationLog.syncIndexes(),
        PushSubscription.syncIndexes(),
      ]);
      console.log('[alerts] alerts/notification_logs/push_subscriptions indexes synced');
    } catch (err) {
      console.error('[alerts] index sync failed:', err.message);
    }
  }
  if (db && config.alerts.enabled) {
    startNotificationWorker();
    console.log(
      `[alerts] notification worker enabled (interval=${config.alerts.workerIntervalSeconds}s, staleThreshold=${config.alerts.staleThresholdSeconds}s, maxRetries=${config.alerts.maxRetries})`
    );
  } else if (!config.alerts.enabled) {
    console.log('[alerts] notification worker disabled (ALERTS_ENABLED=false)');
  }

  // Phase 8: station registry + real station observations.
  if (db && config.stations.enabled) {
    try {
      const Station = require('./models/Station');
      const { StationObservation } = require('./models/StationObservation');
      await Promise.all([Station.syncIndexes(), StationObservation.syncIndexes()]);
      console.log('[stations] stations / station_observations indexes synced');
    } catch (err) {
      console.error('[stations] index sync failed:', err.message);
    }
    // Seed the registry from the real RailRadar stations map (idempotent).
    seedStationsFromRailRadar()
      .then((r) => console.log(`[stations] registry seeded (${r.seeded} stations, alreadySeeded=${Boolean(r.alreadySeeded)})`))
      .catch((err) => console.error('[stations] seed failed:', err.message));
  }

  // Phase 10: AI assistant conversation memory.
  if (db) {
    try {
      const { AiConversation, AiMessage } = require('./models/AiMessage');
      await Promise.all([AiConversation.syncIndexes(), AiMessage.syncIndexes()]);
      console.log('[ai] ai_conversations / ai_messages indexes synced');
    } catch (err) {
      console.error('[ai] index sync failed:', err.message);
    }
  }

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    stopWorker();
    stopNotificationWorker();
    if (config.sse.enabled) {
      streamRouter.closeAll();
      stationStreamRouter.closeAll();
      console.log('[stream] SSE connections closed');
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
