// Phase 10 — per-user AI rate limiting + global token budget.
//
// Uses Upstash Redis REST when configured (production distributed counters)
// with an in-memory fallback for single-instance/dev. Enforcing limits is a
// hard requirement: the assistant is a paid-model surface even when the LLM
// provider is free, so runaway loops must be impossible.

const config = require("../../config/env");

const MEMORY = new Map(); // key -> { count, resetAt }

function memoryIncr(key, ttlSeconds, by = 1) {
  const now = Date.now();
  const entry = MEMORY.get(key);
  if (!entry || now > entry.resetAt) {
    MEMORY.set(key, { count: by, resetAt: now + ttlSeconds * 1000 });
    return by;
  }
  entry.count += by;
  MEMORY.set(key, entry);
  return entry.count;
}

async function redisIncr(key, ttlSeconds, by = 1) {
  if (!config.upstash.url) return null;
  try {
    const res = await fetch(`${config.upstash.url}/incrby/${key}/${by}`, {
      headers: { Authorization: `Bearer ${config.upstash.token}` },
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    const count = Number(json?.result);
    if (Number.isFinite(count) && count === by) {
      await fetch(`${config.upstash.url}/expire/${key}/${ttlSeconds}`, {
        headers: { Authorization: `Bearer ${config.upstash.token}` },
        cache: "no-store",
      }).catch(() => {});
    }
    return count;
  } catch {
    return null;
  }
}

/**
 * Enforce per-user rate limits. Returns { allowed, retryAfterSeconds, reason }
 * when denied, or { allowed: true, remaining } when OK.
 */
async function checkRateLimit(userId) {
  const minKey = `ai:rl:${userId}:minute`;
  const dayKey = `ai:rl:${userId}:day`;

  const minuteLimit = config.ai.rateLimitPerMinute;
  const dayLimit = config.ai.rateLimitPerDay;

  const minuteCount = (await redisIncr(minKey, 60)) ?? memoryIncr(minKey, 60);
  const dayCount =
    (await redisIncr(dayKey, 86400)) ?? memoryIncr(dayKey, 86400);

  if (minuteCount > minuteLimit) {
    return {
      allowed: false,
      retryAfterSeconds: 60,
      reason: "per-minute limit",
    };
  }
  if (dayCount > dayLimit) {
    const seconds = 86400 - Math.floor((Date.now() % 86400000) / 1000);
    return {
      allowed: false,
      retryAfterSeconds: seconds,
      reason: "daily limit",
    };
  }
  return {
    allowed: true,
    remaining: Math.min(minuteLimit - minuteCount, dayLimit - dayCount),
  };
}

/**
 * Track usage against the global rolling monthly token budget. Returns
 * { allowed } when the budget still has room; on exceeding it the assistant
 * must refuse with a clear 429.
 */
async function checkTokenBudget(tokens) {
  const now = new Date();
  const key = `ai:token:budget:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
  const by = Number(tokens) || 0;

  const total =
    (await redisIncr(key, 32 * 86400, by)) ?? memoryIncr(key, 32 * 86400, by);
  if (total > config.ai.monthlyTokenBudget) {
    return { allowed: false, used: total, limit: config.ai.monthlyTokenBudget };
  }
  return { allowed: true, used: total, limit: config.ai.monthlyTokenBudget };
}

function resetMemory() {
  MEMORY.clear();
}

module.exports = { checkRateLimit, checkTokenBudget, resetMemory };
