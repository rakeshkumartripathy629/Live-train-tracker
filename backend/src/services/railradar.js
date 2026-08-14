const config = require('../config/env');
const { cached } = require('./cache');
const { getKeys, markExhausted } = require('./railradar-keys');

const BASE = config.railradar.baseUrl;

// Round-robin cursor so repeated calls spread across the healthy key pool.
let rrCursor = 0;

class RailRadarError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'RailRadarError';
    this.status = status;
    this.code = code;
  }
}

async function doFetch(key, path, { timeoutMs, noStore }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      cache: noStore ? 'no-store' : undefined,
      signal: controller.signal,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const code = json?.error?.code || 'API_ERROR';
      const message = json?.error?.message || `RailRadar error (${res.status})`;
      if (res.status === 429 || code === 'TOO_MANY_REQUESTS') {
        throw new RailRadarError('QUOTA_EXCEEDED', 429, 'TOO_MANY_REQUESTS');
      }
      throw new RailRadarError(message, res.status, code);
    }

    if (!json?.success) {
      throw new RailRadarError(
        json?.error?.message || 'RailRadar returned failure',
        res.status,
        json?.error?.code
      );
    }
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

async function rrFetch(path, { timeoutMs = 8000, noStore = false } = {}) {
  const keys = await getKeys();
  if (!keys.length) {
    throw new RailRadarError(
      'RAILRADAR_NOT_CONFIGURED',
      503,
      'NOT_CONFIGURED'
    );
  }

  const start = (rrCursor = (rrCursor + 1) % keys.length);
  let lastErr = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    try {
      return await doFetch(key, path, { timeoutMs, noStore });
    } catch (err) {
      const rotatable =
        err instanceof RailRadarError && [401, 403, 429].includes(err.status);
      if (rotatable && keys.length > 1) {
        // Quota/auth failure — retire this key and try the next one. When only
        // one key exists we keep it so QUOTA_EXCEEDED surfaces to the caller.
        markExhausted(key).catch(() => {});
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ─── Lookups ───────────────────────────────────────────────────────────

async function searchTrains(query) {
  const data = await cached(
    `rr:train-lookup:${query.toLowerCase().trim()}`,
    86400,
    async () => {
      const q = query.trim();
      if (!q) return {};
      return rrFetch(`/lookup/trains?q=${encodeURIComponent(q)}`);
    }
  );
  return Object.entries(data || {})
    .slice(0, 15)
    .map(([number, name]) => ({ number, name }));
}

async function getAllStations() {
  return cached('rr:stations-map', 86400 * 7, () =>
    rrFetch('/lookup/stations', { timeoutMs: 20000 })
  );
}

async function searchStations(query) {
  const map = await getAllStations();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const entries = Object.entries(map || {});
  const score = ([code, name]) => {
    const c = String(code || '').toLowerCase();
    const n = String(name || '').toLowerCase();
    if (c === q) return 0; // exact code match first
    if (n === q) return 1; // exact name match
    if (n.startsWith(q)) return 2; // name prefix (most intuitive for users)
    if (c.startsWith(q)) return 3; // code prefix
    if (n.includes(q)) return 4; // name anywhere
    if (c.includes(q)) return 5; // code anywhere
    return 99;
  };
  return entries
    .map(([code, name]) => ({ code, name, s: score([code, name]) }))
    .filter((x) => x.s < 99)
    .sort((a, b) => {
      if (a.s !== b.s) return a.s - b.s;
      const la = String(a.name || '').length;
      const lb = String(b.name || '').length;
      if (la !== lb) return la - lb; // shorter names first (major cities sink to top)
      return String(a.name || '').localeCompare(String(b.name || ''));
    })
    .slice(0, 15)
    .map(({ code, name }) => ({ code, name }));
}

// ─── Live status ───────────────────────────────────────────────────────

async function getLiveJourney(trainNumber) {
  return cached(`rr:live:${trainNumber}`, 30, () =>
    rrFetch(`/trains/${trainNumber}/live`, { noStore: true })
  );
}

// ─── Route geometry ───────────────────────────────────────────────────

async function getRouteGeometry(trainNumber) {
  try {
    const data = await cached(`rr:route:${trainNumber}`, 86400, () =>
      rrFetch(`/trains/${trainNumber}/route`)
    );
    let coords = data?.geojson?.geometry?.coordinates;
    if (coords && coords.length > 200) {
      const step = Math.ceil(coords.length / 200);
      coords = coords.filter((_, i) => i % step === 0);
    }
    return coords || null;
  } catch {
    return null;
  }
}

// ─── Train details / schedule / coach position ────────────────────────

async function getTrainDetails(trainNumber) {
  return cached(`rr:details:${trainNumber}`, 86400, () =>
    rrFetch(`/trains/${trainNumber}?haltsOnly=true`)
  );
}

// ─── Trains between stations ──────────────────────────────────────────

async function getTrainsBetween(from, to, { date, live = false } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (live) params.set('live', 'true');
  const qs = params.toString() ? `?${params}` : '';
  return cached(`rr:between:${from}:${to}:${date || ''}:${live}`, live ? 600 : 3600, () =>
    rrFetch(`/trains/between/${from}/${to}${qs}`)
  );
}

// ─── Station live board ───────────────────────────────────────────────

async function getStationLiveBoard(stationCode, hours = 4) {
  const safeHours = [2, 4, 6, 8].includes(hours) ? hours : 4;
  return cached(`rr:station-live:${stationCode}:${safeHours}`, 60, () =>
    rrFetch(`/stations/${stationCode}/live?hours=${safeHours}`, { noStore: true })
  );
}

// ─── Station static board ─────────────────────────────────────────────

async function getStationBoard(stationCode) {
  return cached(`rr:station-board:${stationCode}`, 3600, () =>
    rrFetch(`/stations/${stationCode}/trains`)
  );
}

module.exports = {
  RailRadarError,
  searchTrains,
  getAllStations,
  searchStations,
  getLiveJourney,
  getRouteGeometry,
  getTrainDetails,
  getTrainsBetween,
  getStationLiveBoard,
  getStationBoard,
};
