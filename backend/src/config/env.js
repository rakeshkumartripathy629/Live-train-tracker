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
  // Real weather (OpenWeather) — used by the Phase 10 assistant weather tool.
  // When absent the tool reports WEATHER_NOT_CONFIGURED instead of guessing.
  openweather: {
    apiKey: required('OPENWEATHER_API_KEY', ''),
  },
  // ─── Phase 10 — AI assistant ─────────────────────────────────────────
  ai: {
    // Provider: 'groq' (default), 'gemini', or 'openai'. All speak the
    // OpenAI chat-completions protocol; only the base URL + default model
    // differ. Empty apiKey => the assistant is disabled and /ai/chat
    // answers 503 AI_NOT_CONFIGURED (never a fake reply).
    provider: required('AI_PROVIDER', 'groq'),
    model: required('AI_MODEL', ''),
    apiKey: required('AI_API_KEY', ''),
    baseUrl: required('AI_BASE_URL', ''),
    // Default base URLs per provider (overridable via AI_BASE_URL).
    defaultBaseUrls: {
      groq: 'https://api.groq.com/openai/v1',
      gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
      openai: 'https://api.openai.com/v1',
    },
    defaultModels: {
      groq: 'llama-3.3-70b-versatile',
      gemini: 'gemini-2.0-flash',
      openai: 'gpt-4o-mini',
    },
    temperature: parseFloat(required('AI_TEMPERATURE', '0.2')),
    maxTokens: parseInt(required('AI_MAX_TOKENS', '1024'), 10),
    // Hard cap on consecutive tool calls for a single user turn.
    maxToolCalls: parseInt(required('AI_MAX_TOOL_CALLS', '6'), 10),
    // Timeout for a single provider request (tool round or final answer).
    requestTimeoutMs: parseInt(required('AI_REQUEST_TIMEOUT_MS', '45000'), 10),
    // Conversation memory window (messages loaded per turn).
    historyLimit: parseInt(required('AI_HISTORY_LIMIT', '20'), 10),
    // Per-user rate limits (enforced via Upstash Redis when configured,
    // with an in-memory fallback otherwise).
    rateLimitPerMinute: parseInt(required('AI_RATE_LIMIT_PER_USER_PER_MINUTE', '10'), 10),
    rateLimitPerDay: parseInt(required('AI_RATE_LIMIT_PER_USER_PER_DAY', '100'), 10),
    // Global rolling token budget (spans all users).
    monthlyTokenBudget: parseInt(required('AI_MONTHLY_TOKEN_BUDGET', '500000'), 10),
    // Max characters of a single tool result sent back to the model.
    maxToolOutputChars: parseInt(required('AI_MAX_TOOL_OUTPUT_CHARS', '6000'), 10),
    // Max characters of a user message.
    maxMessageChars: parseInt(required('AI_MAX_MESSAGE_CHARS', '4000'), 10),
  },
};

module.exports = config;
