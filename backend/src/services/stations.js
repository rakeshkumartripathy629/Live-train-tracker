// Station intelligence services (Phase 8 §8–§37): a persistent station
// registry seeded ONLY from the real RailRadar stations map, honest nearby
// lookups, and performance/route aggregations over REAL observations.
//
// Hard rules (Phase 8 §2, §11, §43):
//   - Only code + name come from the source. city/state/lat/lng stay null.
//   - Nearby (geospatial) is available ONLY for stations with verified
//     coordinates — with no verified source today it reports
//     COORDINATES_UNAVAILABLE instead of guessing.
//   - Performance figures are gated behind a minimum sample size — below it the
//     API reports INSUFFICIENT_DATA, never a misleading small number.

const mongoose = require('mongoose');
const Station = require('../models/Station');
const { StationObservation } = require('../models/StationObservation');
const { getAllStations, searchStations, getTrainDetails } = require('./railradar');
const { cached } = require('./cache');
const config = require('../config/env');

const NORM = (s) => String(s || '').trim().toLowerCase();

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function toStationDoc(entry) {
  return {
    code: entry.code,
    name: entry.name,
    normalizedName: NORM(entry.name),
    city: null,
    state: null,
    lat: null,
    lng: null,
    verified: false,
    source: 'RAILRADAR',
  };
}

/**
 * Seed the station registry from the real RailRadar stations map (cached 7d).
 * Runs only when the collection is empty so every restart does not re-write
 * thousands of rows. Real data only.
 */
async function seedStationsFromRailRadar() {
  const count = await Station.estimatedDocumentCount().catch(() => 0);
  if (count > 0) return { seeded: 0, alreadySeeded: true };
  const map = await getAllStations();
  const entries = Object.entries(map || {}).map(([code, name]) => toStationDoc({ code, name }));
  if (entries.length === 0) return { seeded: 0 };
  const now = new Date();
  const result = await Station.bulkWrite(
    entries.map((doc) => ({
      updateOne: {
        filter: { code: doc.code },
        update: { $set: { ...doc, lastSeenAt: now } },
        upsert: true,
      },
    })),
    { ordered: false }
  );
  return { seeded: entries.length, upserted: result.upsertedCount || 0 };
}

/**
 * Station details by code. DB first; if absent, the real RailRadar stations map
 * is the fallback (and the hit is persisted). Returns null when unknown.
 */
async function getStationByCode(code) {
  const c = normalizeCode(code);
  if (!c) return null;
  const doc = await Station.findOne({ code: c }).lean().catch(() => null);
  if (doc) return doc;
  const map = await getAllStations().catch(() => null);
  const name = map && map[c];
  if (!name) return null;
  const station = toStationDoc({ code: c, name });
  await Station.updateOne(
    { code: c },
    { $set: { ...station, lastSeenAt: new Date() } },
    { upsert: true }
  ).catch(() => {});
  return station;
}

/**
 * Station search. Uses the registry when available (normalized code/name
 * prefix + substring), falling back to RailRadar's own search otherwise.
 * Real references only.
 */
async function searchStationsDb(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const cacheKey = `station:search:${q.toLowerCase()}`;
  return cached(cacheKey, 3600, async () => {
    const rx = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(rx, 'i');
    const codeRx = new RegExp(`^${rx}`, 'i');
    const dbResults = await Station.find({
      $or: [{ code: codeRx }, { normalizedName: regex }],
    })
      .sort({ code: 1 })
      .limit(15)
      .lean()
      .catch(() => null);
    if (dbResults && dbResults.length > 0) {
      return dbResults.map((s) => ({ code: s.code, name: s.name }));
    }
    return searchStations(q);
  });
}

/**
 * Nearby stations via the 2dsphere index. Only stations with VERIFIED
 * coordinates can be neighbours — with none verified today this honestly
 * reports COORDINATES_UNAVAILABLE (Phase 8 §37).
 */
async function nearbyStations(code, radiusKm = 50) {
  const c = normalizeCode(code);
  if (!c) return { available: false, reason: 'INVALID_STATION_CODE', stations: [] };
  const cacheKey = `station:nearby:${c}:${radiusKm}`;
  return cached(cacheKey, 3600, async () => {
    const station = await getStationByCode(c);
    if (!station) return { available: false, reason: 'STATION_NOT_FOUND', stations: [] };
    if (!station.verified || typeof station.lng !== 'number' || typeof station.lat !== 'number') {
      return {
        available: false,
        reason: 'COORDINATES_UNAVAILABLE',
        stations: [],
        message: 'This station has no verified coordinates, so nearby stations cannot be computed.',
      };
    }
    const radius = Math.max(1, Number(radiusKm) || 50);
    const results = await Station.find({
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [station.lng, station.lat] },
          $maxDistance: radius * 1000,
        },
      },
    })
      .select({ code: 1, name: 1, lat: 1, lng: 1 })
      .limit(20)
      .lean();
    return {
      available: true,
      center: { code: c, name: station.name },
      radiusKm: radius,
      stations: results
        .filter((s) => s.code !== c)
        .map((s) => ({ code: s.code, name: s.name, distanceKm: null, lat: s.lat, lng: s.lng })),
    };
  });
}

/**
 * Station performance over the configured analytics window, gated behind the
 * minimum sample size. All numbers come from real station observations.
 */
async function stationPerformance(code) {
  const c = normalizeCode(code);
  if (!c) return { available: false, reason: 'INVALID_STATION_CODE', sampleSize: 0 };
  const station = await getStationByCode(c);
  if (!station) return { available: false, reason: 'STATION_NOT_FOUND', sampleSize: 0 };
  const days = Math.max(1, config.stations.analyticsDays);
  const minSample = Math.max(1, config.stations.minSample);
  const cacheKey = `station:perf:${c}`;
  return cached(cacheKey, 300, async () => {
    const since = new Date(Date.now() - days * 86400000);
    const [agg] = await StationObservation.aggregate([
      { $match: { stationCode: c, observedAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          trainCount: { $addToSet: '$trainNumber' },
          arrivals: { $sum: { $cond: [{ $eq: ['$eventType', 'ARRIVED'] }, 1, 0] } },
          departures: { $sum: { $cond: [{ $eq: ['$eventType', 'DEPARTED'] }, 1, 0] } },
          atStation: { $sum: { $cond: [{ $eq: ['$eventType', 'AT_STATION'] }, 1, 0] } },
          delayCount: { $sum: { $cond: [{ $ne: ['$delayMinutes', null] }, 1, 0] } },
          delaySum: { $sum: { $cond: [{ $ne: ['$delayMinutes', null] }, '$delayMinutes', 0] } },
          delayMin: { $min: { $cond: [{ $ne: ['$delayMinutes', null] }, '$delayMinutes', null] } },
          delayMax: { $max: { $cond: [{ $ne: ['$delayMinutes', null] }, '$delayMinutes', null] } },
          onTime: {
            $sum: {
              $cond: [{ $and: [{ $ne: ['$delayMinutes', null] }, { $lte: ['$delayMinutes', 0] }] }, 1, 0],
            },
          },
        },
      },
    ]).catch(() => null);

    if (!agg || agg.total < minSample) {
      return {
        available: false,
        reason: 'INSUFFICIENT_DATA',
        station: { code: c, name: station.name },
        windowDays: days,
        sampleSize: agg ? agg.total : 0,
        message: `Not enough observations yet (${agg ? agg.total : 0} of ${minSample} needed) — real figures only appear once enough trains were observed at this station.`,
      };
    }

    const delayCount = agg.delayCount || 0;
    return {
      available: true,
      station: { code: c, name: station.name },
      windowDays: days,
      sampleSize: agg.total,
      stats: {
        trainCount: (agg.trainCount || []).length,
        arrivals: agg.arrivals || 0,
        departures: agg.departures || 0,
        atStation: agg.atStation || 0,
        delay: delayCount > 0
          ? {
              count: delayCount,
              avgMinutes: Number((agg.delaySum / delayCount).toFixed(1)),
              minMinutes: agg.delayMin,
              maxMinutes: agg.delayMax,
            }
          : { count: 0, avgMinutes: null, minMinutes: null, maxMinutes: null },
        punctualityPercent: delayCount > 0 ? Number((((agg.onTime || 0) / delayCount) * 100).toFixed(1)) : null,
      },
    };
  });
}

// ─── Route intelligence ─────────────────────────────────────────────────

const ROUTE_INTEL_MIN_DELAY_SAMPLE = 3; // per train+station delay gate

function parseHHMM(value) {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return { minutes: Number(m[1]) * 60 + Number(m[2]) };
}

/**
 * Route intelligence for a train (Phase 8 §39–§40). Real route data from the
 * cached schedule + real delay observations. Segment speeds are aggregated from
 * real distances and real scheduled times (never estimates). Station delays are
 * gated behind a minimum sample — no misleading figures.
 */
async function routeIntelligence(trainNumber) {
  const number = String(trainNumber || '').trim();
  if (!/^\d{4,5}$/.test(number)) return { available: false, reason: 'INVALID_TRAIN_NUMBER' };
  const cacheKey = `train:route-intel:${number}`;
  return cached(cacheKey, 300, async () => {
    const details = await getTrainDetails(number).catch(() => null);
    if (!details || !Array.isArray(details.route)) {
      return { available: false, reason: 'ROUTE_UNAVAILABLE' };
    }
    const route = details.route;
    const train = details.train || {};

    const segments = [];
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1];
      const b = route[i];
      const aDist = typeof a.distance === 'number' ? a.distance : null;
      const bDist = typeof b.distance === 'number' ? b.distance : null;
      const dep = parseHHMM(a.departure);
      const arr = parseHHMM(b.arrival);
      const depDay = typeof a.departureDay === 'number' ? a.departureDay : typeof a.day === 'number' ? a.day : 0;
      const arrDay = typeof b.arrivalDay === 'number' ? b.arrivalDay : typeof b.day === 'number' ? b.day : 0;
      let distanceKm = null;
      let scheduledMinutes = null;
      let avgSpeedKmph = null;
      if (aDist !== null && bDist !== null) {
        distanceKm = Number((bDist - aDist).toFixed(1));
        if (dep && arr) {
          scheduledMinutes = (arrDay - depDay) * 1440 + (arr.minutes - dep.minutes);
          if (scheduledMinutes > 0 && distanceKm > 0) {
            avgSpeedKmph = Number(((distanceKm / scheduledMinutes) * 60).toFixed(1));
          }
        }
      }
      segments.push({
        from: { code: a.stationCode || a.station?.code || null, name: a.stationName || a.station?.name || null },
        to: { code: b.stationCode || b.station?.code || null, name: b.stationName || b.station?.name || null },
        distanceKm,
        scheduledMinutes,
        avgSpeedKmph,
      });
    }

    // Real delay profile per station for this train (gated).
    const days = Math.max(1, config.stations.analyticsDays);
    const since = new Date(Date.now() - days * 86400000);
    const raw = await StationObservation.aggregate([
      { $match: { trainNumber: number, observedAt: { $gte: since } } },
      {
        $group: {
          _id: '$stationCode',
          stationName: { $first: '$stationName' },
          total: { $sum: 1 },
          delayCount: { $sum: { $cond: [{ $ne: ['$delayMinutes', null] }, 1, 0] } },
          delaySum: { $sum: { $cond: [{ $ne: ['$delayMinutes', null] }, '$delayMinutes', 0] } },
          delayMin: { $min: { $cond: [{ $ne: ['$delayMinutes', null] }, '$delayMinutes', null] } },
          delayMax: { $max: { $cond: [{ $ne: ['$delayMinutes', null] }, '$delayMinutes', null] } },
        },
      },
      { $sort: { _id: 1 } },
    ]).catch(() => []);

    const stationDelays = raw
      .filter((g) => g.total >= ROUTE_INTEL_MIN_DELAY_SAMPLE && g.delayCount >= ROUTE_INTEL_MIN_DELAY_SAMPLE)
      .map((g) => ({
        stationCode: g._id,
        stationName: g.stationName || null,
        sampleSize: g.total,
        delay: {
          avgMinutes: Number((g.delaySum / g.delayCount).toFixed(1)),
          minMinutes: g.delayMin,
          maxMinutes: g.delayMax,
        },
      }));

    return {
      available: true,
      train: {
        number,
        name: train.name || null,
        source: train.source || null,
        destination: train.destination || null,
      },
      totalStops: route.length,
      segments,
      stationDelays,
      windowDays: days,
      minDelaySample: ROUTE_INTEL_MIN_DELAY_SAMPLE,
    };
  });
}

// ─── Public station list (for building the client-side picker) ─────────

async function listStations(limit = 200) {
  const docs = await Station.find({}).sort({ code: 1 }).limit(limit).lean().catch(() => []);
  if (docs.length > 0) return docs.map((s) => ({ code: s.code, name: s.name }));
  const map = await getAllStations().catch(() => null);
  return Object.entries(map || {}).slice(0, limit).map(([code, name]) => ({ code, name }));
}

module.exports = {
  seedStationsFromRailRadar,
  getStationByCode,
  searchStationsDb,
  nearbyStations,
  stationPerformance,
  routeIntelligence,
  listStations,
  normalizeCode,
};
