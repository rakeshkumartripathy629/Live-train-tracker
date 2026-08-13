const { Router } = require('express');
const {
  searchTrains,
  getLiveJourney,
  getRouteGeometry,
  getTrainDetails,
  getTrainsBetween,
} = require('../services/railradar');
const { normaliseLive } = require('../services/normalize');
const { RailRadarError } = require('../services/railradar');
const { routeIntelligence } = require('../services/stations');

const router = Router();

router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const trains = await searchTrains(q);
    res.json({ success: true, data: trains, count: trains.length });
  } catch (err) {
    next(err);
  }
});

function normaliseBetweenTrain(item) {
  const t = item && item.train ? item.train : {};
  const live = item && item.live ? item.live : null;
  let liveOut;
  if (live && typeof live.expectedArrivalTime === 'string' && live.expectedArrivalTime) {
    const delay = Number(live.delayMinutes) || 0;
    liveOut = {
      type: live.type || 'running',
      startDate: live.startDate || null,
      expectedArrivalTime: live.expectedArrivalTime,
      platform: live.platform || '',
      delayMinutes: delay,
    };
  }
  return {
    number: String(t.number || ''),
    name: t.name || '',
    type: t.type || '',
    runDays: Array.isArray(t.runDays) ? t.runDays : [],
    from: {
      departure: item.from ? item.from.departure || '' : '',
      day: item.from ? Number(item.from.day) || 1 : 1,
      sequence: item.from ? Number(item.from.sequence) || 0 : 0,
    },
    to: {
      arrival: item.to ? item.to.arrival || '' : '',
      day: item.to ? Number(item.to.day) || 1 : 1,
      sequence: item.to ? Number(item.to.sequence) || 0 : 0,
    },
    distance: Number(item.distance) || 0,
    duration: Number(item.duration) || 0,
    totalHaltsBetween: Number(item.totalHaltsBetween) || 0,
    live: liveOut,
  };
}

router.get('/between/:from/:to', async (req, res, next) => {
  try {
    const from = req.params.from.toUpperCase();
    const to = req.params.to.toUpperCase();
    const { date } = req.query;
    // live=true is requested by default so each result card carries its own
    // real live status (running / delay / platform) from RailRadar.
    const data = await getTrainsBetween(from, to, {
      date,
      live: true,
    });
    const trains = Array.isArray(data.trains) ? data.trains.map(normaliseBetweenTrain) : [];
    res.json({
      success: true,
      data: {
        from: data.from || { code: from, name: from },
        to: data.to || { code: to, name: to },
        count: trains.length,
        trains,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Batch live status for multiple trains (used by the favorites page).
// Each train is looked up through the existing Redis/memory cache; a single
// failing train never breaks the whole response.
router.post('/batch-live', async (req, res, next) => {
  try {
    const { trainNumbers } = req.body || {};
    if (!Array.isArray(trainNumbers) || trainNumbers.length === 0) {
      return res.status(400).json({ success: false, error: 'trainNumbers array required' });
    }
    const unique = [...new Set(trainNumbers.map(String).filter(Boolean))].slice(0, 20);
    const results = {};
    await Promise.all(
      unique.map(async (number) => {
        try {
          const [raw, routeGeo] = await Promise.all([
            getLiveJourney(number),
            getRouteGeometry(number).catch(() => null),
          ]);
          if (!raw) {
            results[number] = { error: 'TRAIN_NOT_FOUND' };
            return;
          }
          results[number] = normaliseLive(raw, routeGeo);
        } catch (err) {
          results[number] = { error: 'UNAVAILABLE' };
        }
      })
    );
    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
});

router.get('/:number/live', async (req, res, next) => {
  try {
    const num = req.params.number;
    const [raw, routeGeo] = await Promise.all([
      getLiveJourney(num),
      getRouteGeometry(num).catch(() => null),
    ]);
    if (!raw) return res.status(404).json({ success: false, error: 'Live journey not found' });
    res.json({ success: true, data: normaliseLive(raw, routeGeo) });
  } catch (err) {
    next(err);
  }
});

router.get('/:number/route', async (req, res, next) => {
  try {
    const geo = await getRouteGeometry(req.params.number);
    res.json({ success: true, data: geo });
  } catch (err) {
    next(err);
  }
});

// Phase 8 §39–§40 — route intelligence (real segments + sample-gated delays).
router.get('/:number/route-intelligence', async (req, res, next) => {
  try {
    const result = await routeIntelligence(req.params.number);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/:number', async (req, res, next) => {
  try {
    const num = req.params.number;
    const [details, routeGeo] = await Promise.all([
      getTrainDetails(num),
      getRouteGeometry(num).catch(() => null),
    ]);
    if (!details?.train) return res.status(404).json({ success: false, error: 'Train not found' });
    res.json({ success: true, data: { ...details, routeGeometry: routeGeo } });
  } catch (err) {
    next(err);
  }
});

router.use((err, req, res, next) => {
  if (err instanceof RailRadarError) {
    const status = err.code === 'TOO_MANY_REQUESTS' ? 429 : err.status || 502;
    return res.status(status).json({ success: false, error: err.message, code: err.code });
  }
  next(err);
});

module.exports = router;
