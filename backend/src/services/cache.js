const config = require('../config/env');

// In-memory LRU-ish cache with TTL. Used always as first layer.
const memoryStore = new Map();

function memoryGet(key) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key, value, ttlSeconds) {
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  if (memoryStore.size > 2000) {
    const oldestKey = memoryStore.keys().next().value;
    memoryStore.delete(oldestKey);
  }
}

// Optional Upstash Redis layer (production distributed cache).
async function upstashGet(key) {
  if (!config.upstash.url) return null;
  try {
    const res = await fetch(`${config.upstash.url}/get/${key}`, {
      headers: { Authorization: `Bearer ${config.upstash.token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.result ? JSON.parse(json.result) : null;
  } catch {
    return null;
  }
}

async function upstashSet(key, value, ttlSeconds) {
  if (!config.upstash.url) return;
  try {
    await fetch(`${config.upstash.url}/set/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.upstash.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
      cache: 'no-store',
    });
    if (ttlSeconds) {
      await fetch(`${config.upstash.url}/expire/${key}/${ttlSeconds}`, {
        headers: { Authorization: `Bearer ${config.upstash.token}` },
        cache: 'no-store',
      });
    }
  } catch {
    // Redis down — fall back to memory only.
  }
}

/**
 * Cache helper: check memory first, then Upstash, then run fetcher and write back.
 */
async function cached(key, ttlSeconds, fetcher) {
  const mem = memoryGet(key);
  if (mem !== null && mem !== undefined) return mem;

  const redis = await upstashGet(key);
  if (redis !== null && redis !== undefined) {
    memorySet(key, redis, ttlSeconds);
    return redis;
  }

  const value = await fetcher();
  memorySet(key, value, ttlSeconds);
  await upstashSet(key, value, ttlSeconds);
  return value;
}

async function invalidate(key) {
  memoryStore.delete(key);
  if (config.upstash.url) {
    try {
      await fetch(`${config.upstash.url}/del/${key}`, {
        headers: { Authorization: `Bearer ${config.upstash.token}` },
        cache: 'no-store',
      });
    } catch {
      // ignore
    }
  }
}

module.exports = { cached, invalidate };
