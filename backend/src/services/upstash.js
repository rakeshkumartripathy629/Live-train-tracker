const config = require('../config/env');

// Upstash Redis REST client for worker coordination: distributed locks,
// the due-queue (sorted set), target registry (hashes) and stats counters.
// Every method is optional-safe: when Upstash is not configured or unreachable
// it returns the "unavailable" fallback instead of throwing, so the tracking
// worker keeps running in degraded mode instead of crashing.

const BASE = config.upstash.url;
const TOKEN = config.upstash.token;

async function cmd(path, { method = 'GET', body } = {}) {
  if (!BASE || !TOKEN) return null;
  const res = await fetch(`${BASE}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return json;
}

const parseResult = (json) => (json && 'result' in json ? json.result : null);
const boolResult = (json) => (json && 'result' in json ? Boolean(json.result) : null);

async function get(key) {
  const j = await cmd(`get/${encodeURIComponent(key)}`);
  if (!j || j.result === null || j.result === undefined) return null;
  try {
    return JSON.parse(j.result);
  } catch {
    return j.result;
  }
}

async function set(key, value, ttlSeconds) {
  // Upstash REST: the value is only read from the URL path; a second path
  // segment is parsed as the VALUE, not a TTL. The proven pattern (same as
  // cache.js) is SET then a separate EXPIRE call.
  await cmd(`set/${encodeURIComponent(key)}`, { method: 'POST', body: value });
  if (ttlSeconds) await expire(key, ttlSeconds);
}

async function del(key) {
  await cmd(`del/${encodeURIComponent(key)}`);
}

async function expire(key, seconds) {
  await cmd(`expire/${encodeURIComponent(key)}/${seconds}`);
}

async function setnx(key, value, ttlSeconds) {
  // REST has no SET NX atomic op; emulate with setnx-then-expire.
  const j = await cmd(`setnx/${encodeURIComponent(key)}/${encodeURIComponent(value)}`);
  if (ttlSeconds) await expire(key, ttlSeconds);
  return boolResult(j);
}

async function hset(key, field, value) {
  // Field and value must live in the URL path for Upstash REST.
  const j = await cmd(
    `hset/${encodeURIComponent(key)}/${encodeURIComponent(field)}/${encodeURIComponent(JSON.stringify(value))}`
  );
  return parseResult(j);
}

async function hget(key, field) {
  const j = await cmd(`hget/${encodeURIComponent(key)}/${encodeURIComponent(field)}`);
  return parseResult(j);
}

async function hgetall(key) {
  const j = await cmd(`hgetall/${encodeURIComponent(key)}`);
  const result = parseResult(j);
  if (!result) return {};
  const out = {};
  for (let i = 0; i + 1 < result.length; i += 2) {
    try {
      out[result[i]] = JSON.parse(result[i + 1]);
    } catch {
      out[result[i]] = result[i + 1];
    }
  }
  return out;
}

async function hincrby(key, field, amount) {
  const j = await cmd(`hincrby/${encodeURIComponent(key)}/${encodeURIComponent(field)}/${amount}`);
  return parseResult(j);
}

async function zadd(key, score, member) {
  const j = await cmd(`zadd/${encodeURIComponent(key)}/${score}/${encodeURIComponent(member)}`);
  return parseResult(j);
}

async function zscore(key, member) {
  const j = await cmd(`zscore/${encodeURIComponent(key)}/${encodeURIComponent(member)}`);
  const r = parseResult(j);
  return r === null || r === undefined ? null : Number(r);
}

async function zrangebyscore(key, min, max, { count, withscores = false } = {}) {
  // Upstash REST does not accept offset/count query params on this command —
  // fetch and slice client-side instead.
  const j = await cmd(`zrangebyscore/${encodeURIComponent(key)}/${min}/${max}`);
  const r = parseResult(j);
  if (!r) return [];
  const members = (Array.isArray(r) ? r : []).map((m) => String(m));
  const limited = count ? members.slice(0, count) : members;
  return withscores ? limited.map(Number) : limited;
}

async function zrem(key, member) {
  const j = await cmd(`zrem/${encodeURIComponent(key)}/${encodeURIComponent(member)}`);
  return parseResult(j);
}

async function sadd(key, member) {
  await cmd(`sadd/${encodeURIComponent(key)}/${encodeURIComponent(member)}`);
}

async function smembers(key) {
  const j = await cmd(`smembers/${encodeURIComponent(key)}`);
  const r = parseResult(j);
  return Array.isArray(r) ? r.map(String) : [];
}

async function srem(key, member) {
  await cmd(`srem/${encodeURIComponent(key)}/${encodeURIComponent(member)}`);
}

async function scard(key) {
  const j = await cmd(`scard/${encodeURIComponent(key)}`);
  return parseResult(j) || 0;
}

async function incrby(key, amount) {
  const j = await cmd(`incrby/${encodeURIComponent(key)}/${amount}`);
  return parseResult(j);
}

module.exports = {
  available: Boolean(BASE && TOKEN),
  get,
  set,
  del,
  expire,
  setnx,
  hset,
  hget,
  hgetall,
  hincrby,
  zadd,
  zscore,
  zrangebyscore,
  zrem,
  sadd,
  smembers,
  srem,
  scard,
  incrby,
};
