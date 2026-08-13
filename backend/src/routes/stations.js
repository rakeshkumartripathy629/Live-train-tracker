const { Router } = require('express');
const { searchStations, getStationLiveBoard, getStationBoard, getAllStations } = require('../services/railradar');
const { RailRadarError } = require('../services/railradar');
const {
  getStationByCode,
  searchStationsDb,
  nearbyStations,
  stationPerformance,
  listStations,
  normalizeCode,
} = require('../services/stations');

const router = Router();

router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const stations = await searchStationsDb(q);
    res.json({ success: true, data: stations, count: stations.length });
  } catch (err) {
    next(err);
  }
});

router.get('/all', async (req, res, next) => {
  try {
    const map = await getAllStations();
    res.json({ success: true, data: map });
  } catch (err) {
    next(err);
  }
});

// Phase 8 §9 — station registry list (for the client-side station picker).
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(1000, parseInt(req.query.limit, 10) || 200);
    const stations = await listStations(limit);
    res.json({ success: true, data: stations, count: stations.length });
  } catch (err) {
    next(err);
  }
});

// Phase 8 §15 — station details (real registry record).
router.get('/:code', async (req, res, next) => {
  try {
    const code = normalizeCode(req.params.code);
    if (!code || !/^[A-Z0-9]{2,5}$/.test(code)) {
      return res.status(400).json({ success: false, error: 'Invalid station code', code: 'INVALID_STATION_CODE' });
    }
    const station = await getStationByCode(code);
    if (!station) {
      return res.status(404).json({ success: false, error: 'Station not found', code: 'STATION_NOT_FOUND' });
    }
    res.json({ success: true, data: station });
  } catch (err) {
    next(err);
  }
});

// Phase 8 §34 — station performance (real observations, sample-gated).
router.get('/:code/performance', async (req, res, next) => {
  try {
    const result = await stationPerformance(req.params.code);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Phase 8 §37 — nearby stations (geospatial; honest when coordinates are
// unavailable from the real source).
router.get('/:code/nearby', async (req, res, next) => {
  try {
    const radiusKm = parseInt(req.query.radiusKm, 10) || 50;
    const result = await nearbyStations(req.params.code, radiusKm);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/:code/live', async (req, res, next) => {
  try {
    const code = normalizeCode(req.params.code);
    if (!code || !/^[A-Z0-9]{2,5}$/.test(code)) {
      return res.status(400).json({ success: false, error: 'Invalid station code', code: 'INVALID_STATION_CODE' });
    }
    const hours = parseInt(req.query.hours, 10) || 4;
    const data = await getStationLiveBoard(code, hours);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/:code/board', async (req, res, next) => {
  try {
    const code = normalizeCode(req.params.code);
    if (!code || !/^[A-Z0-9]{2,5}$/.test(code)) {
      return res.status(400).json({ success: false, error: 'Invalid station code', code: 'INVALID_STATION_CODE' });
    }
    const data = await getStationBoard(code);
    res.json({ success: true, data });
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
