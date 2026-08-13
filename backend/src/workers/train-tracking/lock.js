const crypto = require('crypto');
const redis = require('../../services/upstash');
const config = require('../../config/env');
const { KEYS } = require('./types');

// Distributed lock per target. Upstash REST has no atomic SET NX, so we use
// setnx + expire. Cross-instance safety is best-effort; the unique dedupKey
// index on train_snapshots is the hard guarantee that duplicate rows can never
// be written (spec §16).
async function acquire(targetId) {
  if (!redis.available) return null;
  const token = crypto.randomUUID();
  const ok = await redis.setnx(KEYS.lock(targetId), token, config.tracking.lockTtlSeconds);
  return ok ? token : null;
}

async function release(targetId, token) {
  if (!redis.available || !token) return;
  const current = await redis.get(KEYS.lock(targetId));
  if (current === token) {
    await redis.del(KEYS.lock(targetId));
  }
}

module.exports = { acquire, release };
