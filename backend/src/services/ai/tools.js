// Phase 10 — typed tool registry for the AI assistant.
//
// Hard rules (Phase 10):
//   - Every value returned by a tool comes from a REAL data source
//     (RailRadar via the existing services, or user data from Mongo). Tools
//     never guess and never synthesize figures.
//   - Each tool has a name, a description the model can reason about, a JSON
//     schema, an auth scope, and an execute() that returns a plain object.
//   - USER tools are only callable when the backend has a trusted userId
//     (derived server-side from the authenticated Next.js session and passed
//     via x-user-id with a matching x-internal-token). The model NEVER supplies
//     the userId itself.
//   - Outputs are truncated to the configured max before being sent to the
//     model so a huge result can never blow the token budget.

const config = require("../../config/env");
const mongoose = require("mongoose");
const {
  searchTrains,
  getLiveJourney,
  getRouteGeometry,
  getTrainDetails,
  getTrainsBetween,
  getStationLiveBoard,
} = require("../railradar");
const {
  getStationByCode,
  searchStationsDb,
  stationPerformance,
  routeIntelligence,
  normalizeCode,
} = require("../stations");
const { normaliseLive } = require("../normalize");
const { StationObservation } = require("../../models/StationObservation");
const { ALERT_TYPES } = require("../../models/Alert");

const MAX_OUTPUT = Math.max(500, config.ai.maxToolOutputChars || 6000);

function clipArray(arr, limit) {
  return Array.isArray(arr) ? arr.slice(0, limit) : [];
}

function errObj(code, message, extra = {}) {
  return { error: { code, message }, ...extra };
}

async function userCollection(name) {
  const db = mongoose.connection?.db;
  if (!db) throw new Error("DB_NOT_READY");
  return db.collection(name);
}

// ─── Train analytics (Phase 10 §14) ────────────────────────────────────
// Real aggregations over genuine station observations (the same data the alert
// engine derives). Gated behind a minimum sample size so no misleading small
// figures are ever produced. Phase 9's analytics service is not present in this
// codebase, so this tool implements the honest subset here.

const TRAIN_ANALYTICS_MIN_SAMPLE = 3;

async function getTrainAnalytics(trainNumber) {
  const number = String(trainNumber || "").trim();
  if (!/^\d{4,5}$/.test(number))
    return { available: false, reason: "INVALID_TRAIN_NUMBER" };
  const days = Math.max(1, config.stations.analyticsDays);
  const since = new Date(Date.now() - days * 86400000);

  const [agg] = await StationObservation.aggregate([
    { $match: { trainNumber: number, observedAt: { $gte: since } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        arrivals: {
          $sum: { $cond: [{ $eq: ["$eventType", "ARRIVED"] }, 1, 0] },
        },
        departures: {
          $sum: { $cond: [{ $eq: ["$eventType", "DEPARTED"] }, 1, 0] },
        },
        atStation: {
          $sum: { $cond: [{ $eq: ["$eventType", "AT_STATION"] }, 1, 0] },
        },
        delays: {
          $push: {
            $cond: [{ $ne: ["$delayMinutes", null] }, "$delayMinutes", null],
          },
        },
        stationCount: { $addToSet: "$stationCode" },
      },
    },
  ]).catch(() => null);

  if (!agg || agg.total < TRAIN_ANALYTICS_MIN_SAMPLE) {
    return {
      available: false,
      reason: "INSUFFICIENT_DATA",
      train: { number },
      windowDays: days,
      sampleSize: agg ? agg.total : 0,
      minSample: TRAIN_ANALYTICS_MIN_SAMPLE,
      message: `Not enough real observations yet (${agg ? agg.total : 0} of ${TRAIN_ANALYTICS_MIN_SAMPLE} needed) — analytics only appear once this train was genuinely tracked.`,
    };
  }

  const delays = (agg.delays || []).filter(
    (d) => d !== null && Number.isFinite(d),
  );
  const sorted = delays.slice(0, 2000).sort((a, b) => a - b);
  const n = sorted.length;
  const avg = n > 0 ? sorted.reduce((s, d) => s + d, 0) / n : null;
  const median = n > 0 ? sorted[Math.floor(n / 2)] : null;
  const onTime = n > 0 ? sorted.filter((d) => d <= 0).length / n : null;
  const bucket = (min, max) =>
    n > 0
      ? sorted.filter((d) => d >= min && (max === null || d < max)).length
      : 0;
  const distribution = {
    "0-5 min": bucket(0, 5),
    "5-15 min": bucket(5, 15),
    "15-30 min": bucket(15, 30),
    "30-60 min": bucket(30, 60),
    "60+ min": bucket(60, null),
  };
  const score =
    avg === null
      ? null
      : Math.max(0, Math.min(100, Math.round(100 - avg * 1.2)));

  return {
    available: true,
    train: { number },
    windowDays: days,
    sampleSize: agg.total,
    delaySampleSize: n,
    stats: {
      avgDelayMinutes: avg === null ? null : Number(avg.toFixed(1)),
      medianDelayMinutes: median === null ? null : Number(median.toFixed(1)),
      minDelayMinutes: n > 0 ? sorted[0] : null,
      maxDelayMinutes: n > 0 ? sorted[n - 1] : null,
      onTimeRatePercent:
        onTime === null ? null : Number((onTime * 100).toFixed(1)),
      punctual: onTime === null ? null : onTime >= 0.7,
      delayDistributionPercent: n > 0 ? distribution : null,
      performanceScore: score,
      performanceScoreFormula:
        "100 - 1.2 × average delay minutes (clamped 0–100)",
      arrivals: agg.arrivals || 0,
      departures: agg.departures || 0,
      atStation: agg.atStation || 0,
      stationsObserved: (agg.stationCount || []).length,
    },
  };
}

// ─── Tool definitions ───────────────────────────────────────────────────

const tools = [
  {
    name: "searchStations",
    description:
      'Search Indian railway stations by code or name. Returns the closest real matches with their station codes. Use this first when the user mentions a place (e.g. "Bhubaneswar", "BAM") so you always use the correct station code.',
    auth: "PUBLIC",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Station name or code to search",
        },
      },
      required: ["query"],
    },
    async execute(ctx, args) {
      const q = String(args.query || "").trim();
      if (!q) return errObj("INVALID_QUERY", "query is required");
      const results = await searchStationsDb(q);
      return {
        query: q,
        count: results.length,
        stations: clipArray(results, 15),
      };
    },
  },
  {
    name: "searchTrains",
    description:
      "Search Indian trains by number or name fragment. Returns matching real trains with number + name. Use this first when the user references a train by partial name/number so you always use the real train number.",
    auth: "PUBLIC",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Train number or name fragment" },
      },
      required: ["query"],
    },
    async execute(ctx, args) {
      const q = String(args.query || "").trim();
      if (!q) return errObj("INVALID_QUERY", "query is required");
      const results = await searchTrains(q);
      return {
        query: q,
        count: results.length,
        trains: clipArray(results, 15),
      };
    },
  },
  {
    name: "getTrainLiveStatus",
    description:
      "Get the CURRENT real-time status of a running train: running/completed/cancelled status, delay in minutes, current and next station with arrival times, ETA, and journey completion. All values come from the real live feed. If live data is temporarily unavailable the result says so honestly.",
    auth: "PUBLIC",
    parameters: {
      type: "object",
      properties: {
        trainNumber: { type: "string", description: "5-digit train number" },
      },
      required: ["trainNumber"],
    },
    async execute(ctx, args) {
      const number = String(args.trainNumber || "").trim();
      if (!/^\d{4,5}$/.test(number))
        return errObj(
          "INVALID_TRAIN_NUMBER",
          "A valid 4-5 digit train number is required",
        );
      const [raw, routeGeo] = await Promise.all([
        getLiveJourney(number).catch(() => null),
        getRouteGeometry(number).catch(() => null),
      ]);
      if (!raw) {
        return errObj(
          "TRAIN_NOT_FOUND",
          "No live journey found for this train number",
        );
      }
      const live = normaliseLive(raw, routeGeo);
      const stop = (s) =>
        s
          ? {
              code: s.code,
              name: s.name,
              scheduledArrival: s.scheduledArrival,
              scheduledDeparture: s.scheduledDeparture,
              distanceKm: s.distanceKm,
            }
          : null;
      return {
        number: live.number,
        name: live.name,
        status: live.status,
        delayMinutes: live.delayMinutes,
        origin: live.origin,
        destination: live.destination,
        currentStation: stop(live.currentStation),
        previousStation: stop(live.previousStation),
        nextStation: stop(live.nextStation),
        ETA: live.ETA,
        completionPercentage: live.completionPercentage,
        remainingDistanceKm: live.remainingDistanceKm,
        speedKmh: live.speedKmh,
        lastUpdated: live.lastUpdated,
      };
    },
  },
  {
    name: "getTrainRoute",
    description:
      'Get the full real route/schedule of a train: source, destination, total stops, and the scheduled halt list with arrival/departure times, day and distance. Use for "stops at", "schedule", "how long" questions.',
    auth: "PUBLIC",
    parameters: {
      type: "object",
      properties: {
        trainNumber: { type: "string", description: "5-digit train number" },
      },
      required: ["trainNumber"],
    },
    async execute(ctx, args) {
      const number = String(args.trainNumber || "").trim();
      if (!/^\d{4,5}$/.test(number))
        return errObj(
          "INVALID_TRAIN_NUMBER",
          "A valid 4-5 digit train number is required",
        );
      const details = await getTrainDetails(number).catch(() => null);
      if (!details || !Array.isArray(details.route)) {
        return errObj(
          "ROUTE_UNAVAILABLE",
          "Route data is not available for this train",
        );
      }
      const route = details.route || [];
      const train = details.train || {};
      const stops = route.map((s) => ({
        code: s.stationCode || s.station?.code || null,
        name: s.stationName || s.station?.name || s.stationCode || null,
        arrival: s.arrival || null,
        departure: s.departure || null,
        day: s.day ?? s.departureDay ?? null,
        distance: s.distance ?? null,
        halt: s.isHalt !== undefined ? Boolean(s.isHalt) : null,
      }));
      const head = stops.slice(0, 12);
      const tail = stops.length > 14 ? stops.slice(-4) : [];
      return {
        number,
        name: train.name || null,
        source: train.source || null,
        destination: train.destination || null,
        totalStops: stops.length,
        summaryStops: head,
        lastStops: tail,
        note: "summaryStops shows the first 12 halts and lastStops the final 4 — ask for a specific station to see its timings.",
      };
    },
  },
  {
    name: "getTrainsBetweenStations",
    description:
      'Find real trains running between two stations on a date, with scheduled departure/arrival, duration, run days and live status where available. Use for "trains between X and Y" questions.',
    auth: "PUBLIC",
    parameters: {
      type: "object",
      properties: {
        fromCode: {
          type: "string",
          description: "Origin station code (e.g. BAM)",
        },
        toCode: {
          type: "string",
          description: "Destination station code (e.g. BBS)",
        },
        date: {
          type: "string",
          description: "Optional travel date in YYYY-MM-DD (defaults to today)",
        },
      },
      required: ["fromCode", "toCode"],
    },
    async execute(ctx, args) {
      const from = normalizeCode(args.fromCode);
      const to = normalizeCode(args.toCode);
      if (!from || !to)
        return errObj(
          "INVALID_STATION_CODES",
          "fromCode and toCode are required",
        );
      const data = await getTrainsBetween(from, to, {
        date: args.date || undefined,
        live: true,
      }).catch(() => null);
      if (!data)
        return errObj(
          "SOURCE_UNAVAILABLE",
          "Train list could not be fetched right now",
        );
      const trains = Array.isArray(data.trains) ? data.trains : [];
      return {
        from: data.from || { code: from, name: from },
        to: data.to || { code: to, name: to },
        count: trains.length,
        trains: clipArray(
          trains.map((t) => {
            const tr = t.train || {};
            const live = t.live || null;
            return {
              number: String(tr.number || ""),
              name: tr.name || "",
              departure: t.from?.departure || "",
              arrival: t.to?.arrival || "",
              durationMinutes: t.duration || 0,
              runDays: Array.isArray(tr.runDays) ? tr.runDays : [],
              live: live
                ? {
                    type: live.type || null,
                    delayMinutes: live.delayMinutes || 0,
                    platform: live.platform || null,
                  }
                : null,
            };
          }),
          10,
        ),
      };
    },
  },
  {
    name: "getStationLiveBoard",
    description:
      'Get the REAL live board for a station: trains currently arriving/departing from this station in the next hours, with scheduled/expected times, platform and delays. Use for "what is running from station X" questions.',
    auth: "PUBLIC",
    parameters: {
      type: "object",
      properties: {
        stationCode: { type: "string", description: "Station code (e.g. BBS)" },
        hours: {
          type: "number",
          description: "Look-ahead window in hours (2, 4, 6 or 8; default 4)",
          enum: [2, 4, 6, 8],
        },
      },
      required: ["stationCode"],
    },
    async execute(ctx, args) {
      const code = normalizeCode(args.stationCode);
      if (!code)
        return errObj("INVALID_STATION_CODE", "stationCode is required");
      const hours = [2, 4, 6, 8].includes(Number(args.hours))
        ? Number(args.hours)
        : 4;
      const data = await getStationLiveBoard(code, hours).catch(() => null);
      if (!data)
        return errObj(
          "SOURCE_UNAVAILABLE",
          "Live board could not be fetched right now",
        );
      const rows = Array.isArray(data.board)
        ? data.board
        : Array.isArray(data.trains)
          ? data.trains
          : [];
      return {
        stationCode: code,
        stationName: data.station?.name || data.stationName || code,
        hours,
        count: rows.length,
        board: clipArray(rows, 15),
      };
    },
  },
  {
    name: "getStationPerformance",
    description:
      "Get real station performance analytics: how punctual trains are at this station, average delays, arrival/departure counts over the analytics window. Only real observations are shown — below the minimum sample size it reports INSUFFICIENT_DATA instead of guessing.",
    auth: "PUBLIC",
    parameters: {
      type: "object",
      properties: {
        stationCode: { type: "string", description: "Station code (e.g. BBS)" },
      },
      required: ["stationCode"],
    },
    async execute(ctx, args) {
      const code = normalizeCode(args.stationCode);
      if (!code)
        return errObj("INVALID_STATION_CODE", "stationCode is required");
      const perf = await stationPerformance(code).catch(() => null);
      if (!perf)
        return errObj(
          "SOURCE_UNAVAILABLE",
          "Station performance could not be computed right now",
        );
      return perf;
    },
  },
  {
    name: "getTrainAnalytics",
    description:
      "Get real train performance analytics over the last few weeks: average and median delay, on-time rate, delay distribution, sample size and a derived performance score. Built ONLY from genuine tracked observations of this train — never estimates. Reports INSUFFICIENT_DATA below the minimum sample size.",
    auth: "PUBLIC",
    parameters: {
      type: "object",
      properties: {
        trainNumber: { type: "string", description: "5-digit train number" },
      },
      required: ["trainNumber"],
    },
    execute: getTrainAnalytics,
  },
  {
    name: "getTrainRouteIntelligence",
    description:
      'Real route intelligence for a train: segment-wise distances, scheduled durations and average speeds between consecutive halts, plus sample-gated delay profiles per station. Use for "is train X on time at station Y", segment speed, or delay pattern questions.',
    auth: "PUBLIC",
    parameters: {
      type: "object",
      properties: {
        trainNumber: { type: "string", description: "5-digit train number" },
      },
      required: ["trainNumber"],
    },
    async execute(ctx, args) {
      const number = String(args.trainNumber || "").trim();
      if (!/^\d{4,5}$/.test(number))
        return errObj(
          "INVALID_TRAIN_NUMBER",
          "A valid 4-5 digit train number is required",
        );
      const ri = await routeIntelligence(number).catch(() => null);
      if (!ri)
        return errObj(
          "SOURCE_UNAVAILABLE",
          "Route intelligence could not be computed right now",
        );
      return {
        available: ri.available,
        reason: ri.reason,
        train: ri.train,
        totalStops: ri.totalStops,
        windowDays: ri.windowDays,
        sampleStations: clipArray((ri.stationDelays || []).slice(0, 12), 12),
        segmentSummary: clipArray((ri.segments || []).slice(0, 15), 15),
        note: "stationDelays are sample-gated — only stations with enough genuine observations appear.",
      };
    },
  },
  {
    name: "getWeatherAtStation",
    description:
      "Get the current real weather near a station (OpenWeather) when coordinates exist and the weather API key is configured. Never guesses: if the station has no verified coordinates it returns COORDINATES_UNAVAILABLE, and if weather is not configured it returns WEATHER_NOT_CONFIGURED.",
    auth: "PUBLIC",
    parameters: {
      type: "object",
      properties: {
        stationCode: { type: "string", description: "Station code (e.g. BBS)" },
      },
      required: ["stationCode"],
    },
    async execute(ctx, args) {
      const code = normalizeCode(args.stationCode);
      if (!code)
        return errObj("INVALID_STATION_CODE", "stationCode is required");
      if (!config.openweather.apiKey) {
        return errObj(
          "WEATHER_NOT_CONFIGURED",
          "Weather is not configured on this deployment",
          {
            stationCode: code,
          },
        );
      }
      const station = await getStationByCode(code).catch(() => null);
      if (!station)
        return errObj("STATION_NOT_FOUND", "Unknown station code", {
          stationCode: code,
        });
      if (typeof station.lat !== "number" || typeof station.lng !== "number") {
        return errObj(
          "COORDINATES_UNAVAILABLE",
          `This station (${code}) has no verified coordinates in the registry, so live weather cannot be fetched for it.`,
        );
      }
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${station.lat}&lon=${station.lng}&units=metric&appid=${config.openweather.apiKey}`;
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok)
        return errObj(
          "WEATHER_UNAVAILABLE",
          `Weather source returned HTTP ${res.status}`,
        );
      const data = await res.json().catch(() => null);
      if (!data || !data.main)
        return errObj("WEATHER_UNAVAILABLE", "Weather source returned no data");
      return {
        stationCode: code,
        stationName: station.name,
        tempC: Math.round(data.main.temp),
        feelsLikeC: Math.round(data.main.feels_like),
        humidity: data.main.humidity,
        windSpeedKmh: Math.round((data.wind?.speed || 0) * 3.6),
        condition: data.weather?.[0]?.main || "Clear",
        description: data.weather?.[0]?.description || null,
        updatedAt: new Date().toISOString(),
      };
    },
  },
  {
    name: "getUserJourneys",
    description:
      "List the signed-in user's saved journeys from the app (planned, active, completed, cancelled) with train number/name, stations and journey date. Returns nothing personal beyond the user's own data. Requires the user to be signed in.",
    auth: "USER",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Optional filter: PLANNED, ACTIVE, COMPLETED, CANCELLED",
          enum: ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"],
        },
      },
      required: [],
    },
    async execute(ctx, args) {
      const col = await userCollection("journeys");
      const filter = { userId: ctx.userId };
      if (args.status) filter.status = String(args.status).toUpperCase();
      const docs = await col
        .find(filter)
        .sort({ updatedAt: -1 })
        .limit(20)
        .toArray();
      return {
        count: docs.length,
        journeys: clipArray(
          docs.map((d) => ({
            id: String(d._id),
            trainNumber: d.trainNumber,
            trainName: d.trainName || "",
            origin: d.origin || { code: "", name: "" },
            destination: d.destination || { code: "", name: "" },
            boardingStationCode: d.boardingStationCode || null,
            journeyDate: d.journeyDate || null,
            status: d.status,
            startedAt: d.startedAt || null,
            completedAt: d.completedAt || null,
          })),
          20,
        ),
      };
    },
  },
  {
    name: "getUserFavorites",
    description:
      "List the signed-in user's favorite trains from the app with number, name, and origin/destination. Only the user's own favorites.",
    auth: "USER",
    parameters: { type: "object", properties: {}, required: [] },
    async execute(ctx, args) {
      const col = await userCollection("favorites");
      const docs = await col
        .find({ $or: [{ userId: ctx.userId }, { deviceId: ctx.userId }] })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();
      return {
        count: docs.length,
        favorites: clipArray(
          docs.map((f) => ({
            trainNumber: f.trainNumber,
            trainName: f.trainName || "",
            origin: { code: f.fromCode || "", name: f.fromName || "" },
            destination: { code: f.toCode || "", name: f.toName || "" },
            createdAt: f.createdAt || null,
          })),
          50,
        ),
      };
    },
  },
  {
    name: "getUserAlerts",
    description:
      "List the signed-in user's active alert rules (delay thresholds, train started/arrived/departed, destination approaching, etc.) configured for their journeys. Only the user's own alerts.",
    auth: "USER",
    parameters: { type: "object", properties: {}, required: [] },
    async execute(ctx, args) {
      const col = await userCollection("alerts");
      const docs = await col
        .find({ userId: ctx.userId })
        .sort({ updatedAt: -1 })
        .limit(50)
        .toArray();
      return {
        count: docs.length,
        alerts: clipArray(
          docs.map((a) => ({
            id: String(a._id),
            journeyId: a.journeyId,
            trainNumber: a.trainNumber,
            alertType: ALERT_TYPES.includes(a.alertType) ? a.alertType : null,
            targetStationCode: a.targetStationCode || null,
            threshold: a.threshold ?? null,
            enabled: a.enabled !== false,
            lastTriggeredAt: a.lastTriggeredAt || null,
          })),
          50,
        ),
      };
    },
  },
];

const TOOLS_BY_NAME = new Map(tools.map((t) => [t.name, t]));

function toolSchemas() {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Execute a named tool with a context. USER tools refuse when ctx.userId is
 * absent. Output is serialized and truncated to the configured max — a huge
 * result can never flood the context.
 */
async function executeTool(name, ctx, rawArgs) {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) return { success: false, error: `Unknown tool: ${name}` };
  if (tool.auth === "USER" && !ctx.userId) {
    return { success: false, error: "This action requires a signed-in user" };
  }

  let args = {};
  try {
    args = JSON.parse(typeof rawArgs === "string" && rawArgs ? rawArgs : "{}");
  } catch {
    args = {};
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) args = {};

  let result;
  try {
    result = await tool.execute(ctx, args);
  } catch (err) {
    result = {
      error: {
        code: "TOOL_FAILED",
        message: err?.message || "Tool execution failed",
      },
    };
  }

  let text;
  try {
    text = JSON.stringify(result);
  } catch {
    text = String(result);
  }
  if (text.length > MAX_OUTPUT) {
    text = `${text.slice(0, MAX_OUTPUT)}… [output truncated by RailGaadi to keep the model context safe]`;
  }
  return { success: true, text };
}

module.exports = {
  tools,
  TOOLS_BY_NAME,
  toolSchemas,
  executeTool,
  MAX_OUTPUT,
  getTrainAnalytics,
  TRAIN_ANALYTICS_MIN_SAMPLE,
};
