const { Router } = require('express');
const Favorite = require('../models/Favorite');
const RecentSearch = require('../models/RecentSearch');

const router = Router();

// ─── Favorites ─────────────────────────────────────────────────────────

router.get('/favorites', async (req, res, next) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) return res.status(400).json({ success: false, error: 'deviceId required' });
    const favorites = await Favorite.find({ deviceId }).sort({ createdAt: -1 });
    res.json({
      success: true,
      data: favorites.map((f) => ({
        id: f._id.toString(),
        number: f.trainNumber,
        name: f.trainName,
        origin: { code: f.fromCode, name: f.fromName },
        destination: { code: f.toCode, name: f.toName },
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/favorites', async (req, res, next) => {
  try {
    const { deviceId, train } = req.body || {};
    if (!deviceId || !train?.number) {
      return res.status(400).json({ success: false, error: 'deviceId and train.number required' });
    }
    const favorite = await Favorite.findOneAndUpdate(
      { deviceId, trainNumber: train.number },
      {
        $set: {
          trainName: train.name || '',
          fromCode: train.origin?.code || '',
          fromName: train.origin?.name || '',
          toCode: train.destination?.code || '',
          toName: train.destination?.name || '',
        },
      },
      { upsert: true, new: true }
    );
    res.status(201).json({ success: true, data: favorite });
  } catch (err) {
    next(err);
  }
});

router.delete('/favorites/:trainNumber', async (req, res, next) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) return res.status(400).json({ success: false, error: 'deviceId required' });
    await Favorite.findOneAndDelete({ deviceId, trainNumber: req.params.trainNumber });
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

// ─── Recent searches ───────────────────────────────────────────────────

router.get('/recent', async (req, res, next) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) return res.status(400).json({ success: false, error: 'deviceId required' });
    const items = await RecentSearch.find({ deviceId }).sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

router.post('/recent', async (req, res, next) => {
  try {
    const { deviceId, type, query, label, extra } = req.body || {};
    if (!deviceId || !type || !query) {
      return res.status(400).json({ success: false, error: 'deviceId, type and query required' });
    }
    await RecentSearch.findOneAndUpdate(
      { deviceId, type, query },
      { $set: { label: label || '', extra: extra || {} }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true }
    );
    const recent = await RecentSearch.find({ deviceId }).sort({ createdAt: -1 });
    if (recent.length > 30) {
      const toDelete = recent.slice(30).map((r) => r._id);
      await RecentSearch.deleteMany({ _id: { $in: toDelete } });
    }
    res.status(201).json({ success: true, data: { saved: true } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
