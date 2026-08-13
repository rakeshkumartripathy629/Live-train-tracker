require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

const nodeEnv = required('NODE_ENV', 'development');

const config = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: parseInt(required('PORT', '4000'), 10),
  mongoUri: required('MONGODB_URI', 'mongodb://localhost:27017/railgaadi'),
  corsOrigins: required('CORS_ORIGINS', '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  railradar: {
    apiKey: required('RAILRADAR_API_KEY', ''),
    baseUrl: required('RAILRADAR_BASE_URL', 'https://api.railradar.in/v1'),
  },
  upstash: {
    url: required('UPSTASH_REDIS_REST_URL', ''),
    token: required('UPSTASH_REDIS_REST_TOKEN', ''),
  },
  vapid: {
    publicKey: required('VAPID_PUBLIC_KEY', ''),
    privateKey: required('VAPID_PRIVATE_KEY', ''),
    subject: required('VAPID_SUBJECT', 'mailto:dev@railgaadi.in'),
  },
  tracking: {
    enabled: required('TRAIN_TRACKING_ENABLED', 'true') !== 'false',
    intervalSeconds: parseInt(required('TRAIN_TRACKING_INTERVAL_SECONDS', '60'), 10),
    schedulerSeconds: parseInt(required('TRAIN_TRACKING_SCHEDULER_SECONDS', '60'), 10),
    prestartMinutes: parseInt(required('TRAIN_TRACKING_PRESTART_MINUTES', '180'), 10),
    concurrency: parseInt(required('TRAIN_TRACKING_CONCURRENCY', '3'), 10),
    maxTargets: parseInt(required('TRAIN_TRACKING_MAX_TARGETS', '20'), 10),
    lockTtlSeconds: parseInt(required('TRAIN_TRACKING_LOCK_TTL_SECONDS', '30'), 10),
    maxRetries: parseInt(required('TRAIN_TRACKING_MAX_RETRIES', '3'), 10),
    snapshotRetentionDays: parseInt(required('TRAIN_SNAPSHOT_RETENTION_DAYS', '90'), 10),
  },
  internalToken: required('INTERNAL_API_TOKEN', ''),
  sse: {
    enabled: required('SSE_ENABLED', 'true') !== 'false',
    heartbeatSeconds: parseInt(required('SSE_HEARTBEAT_SECONDS', '15'), 10),
    redisSyncSeconds: parseInt(required('SSE_REDIS_SYNC_SECONDS', '30'), 10),
    maxConnectionsPerUser: parseInt(required('SSE_MAX_CONNECTIONS_PER_USER', '5'), 10),
    maxConnections: parseInt(required('SSE_MAX_CONNECTIONS', '500'), 10),
  },
  alerts: {
    enabled: required('ALERTS_ENABLED', 'true') !== 'false',
    staleThresholdSeconds: parseInt(required('TRAIN_STALE_THRESHOLD_SECONDS', '1800'), 10),
    workerIntervalSeconds: parseInt(required('NOTIFY_WORKER_INTERVAL_SECONDS', '10'), 10),
    maxRetries: parseInt(required('NOTIFY_MAX_RETRIES', '5'), 10),
    retryBaseSeconds: parseInt(required('NOTIFY_RETRY_BASE_SECONDS', '30'), 10),
    queueTtlSeconds: parseInt(required('NOTIFY_QUEUE_TTL_SECONDS', '604800'), 10),
    dedupeTtlSeconds: parseInt(required('NOTIFY_DEDUPE_TTL_SECONDS', '86400'), 10),
  },
  stations: {
    enabled: required('STATION_INTELLIGENCE_ENABLED', 'true') !== 'false',
    // Analytics window for station/route performance aggregations.
    analyticsDays: parseInt(required('STATION_ANALYTICS_DAYS', '14'), 10),
    // Minimum distinct observations before any performance figure is shown.
    // Below this the API reports INSUFFICIENT_DATA — never a misleading
    // small-sample number (Phase 8 §34).
    minSample: parseInt(required('STATION_MIN_SAMPLE', '10'), 10),
    // Live board default window (hours).
    boardWindowHours: parseInt(required('STATION_BOARD_WINDOW_HOURS', '4'), 10),
  },
};

module.exports = config;
