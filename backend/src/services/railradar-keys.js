// Phase 10.1 — RailRadar key resolution + rotation.
//
// Order of preference:
//   1. RAILRADAR_API_KEY env (legacy override) — first, until it is observed
//      to be exhausted (401/403/429), after which the DB pool takes over.
//   2. Active keys stored in MongoDB (add/revoke via the admin API), newest
//      added first, loaded lazily with a short TTL so a new key added via the
//      web page is picked up without a restart.
//
// rrFetch drives the rotation: on 401/403/429 it calls markExhausted() and the
// next call transparently uses the next healthy key.

const config = require("../config/env");
const RailRadarKey = require("../models/RailRadarKey");

const CACHE_TTL_MS = 30000;

let dbCache = { keys: null, at: 0 };
let envKeyExhausted = false;

async function refreshDbKeys() {
  const docs = await RailRadarKey.find({ status: "active" })
    .sort({ createdAt: -1 })
    .lean();
  dbCache = {
    keys: docs.map((d) => d.key),
    at: Date.now(),
  };
  return dbCache.keys;
}

async function getKeys() {
  const list = [];
  if (config.railradar.apiKey && !envKeyExhausted) list.push(config.railradar.apiKey);
  if (dbCache.keys && Date.now() - dbCache.at < CACHE_TTL_MS) {
    return list.concat(dbCache.keys);
  }
  try {
    const dbKeys = await refreshDbKeys();
    return list.concat(dbKeys);
  } catch {
    return list.concat(dbCache.keys || []);
  }
}

function invalidateCache() {
  dbCache = { keys: null, at: 0 };
}

async function markExhausted(key) {
  if (key && config.railradar.apiKey === key) {
    envKeyExhausted = true;
    return;
  }
  try {
    const res = await RailRadarKey.updateOne(
      { key, status: "active" },
      { $set: { status: "exhausted", usedAt: new Date() } }
    );
    if (res.modifiedCount > 0) invalidateCache();
  } catch {
    // best-effort; rotation still proceeds for this process lifetime
  }
}

module.exports = { getKeys, markExhausted, invalidateCache };
