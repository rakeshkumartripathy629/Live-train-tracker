const { Router } = require('express');
const Alarm = require('../models/Alarm');
const webpush = require('web-push');
const config = require('../config/env');
const { getLiveJourney } = require('../services/railradar');

const router = Router();

const pushReady = Boolean(config.vapid.publicKey && config.vapid.privateKey);
if (pushReady) {
  webpush.setVapidDetails(
    config.vapid.subject,
    config.vapid.publicKey,
    config.vapid.privateKey
  );
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

router.post('/', async (req, res, next) => {
  try {
    const {
      deviceId,
      trainNumber,
      trainName,
      stationCode,
      stationName,
      distanceKm = 20,
      mode = 'distance',
      pushSubscription,
    } = req.body || {};

    if (!deviceId || !trainNumber || !stationCode) {
      return res.status(400).json({ success: false, error: 'deviceId, trainNumber and stationCode are required' });
    }

    const alarm = await Alarm.create({
      deviceId,
      trainNumber,
      trainName: trainName || '',
      stationCode,
      stationName: stationName || '',
      distanceKm: Math.max(5, Math.min(500, distanceKm || 20)),
      mode: mode === 'arrival' ? 'arrival' : 'distance',
      pushSubscription: pushSubscription || null,
    });

    res.status(201).json({ success: true, data: alarm });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) return res.status(400).json({ success: false, error: 'deviceId required' });
    const alarms = await Alarm.find({ deviceId, active: true }).sort({ createdAt: -1 });
    res.json({ success: true, data: alarms });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await Alarm.findByIdAndDelete(req.params.id);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

// Background checker: evaluates all active alarms and fires push notifications.
// Run on an interval (e.g. every 60s) from server.js.
async function checkAlarms() {
  const alarms = await Alarm.find({ active: true }).limit(200);
  for (const alarm of alarms) {
    try {
      const journey = await getLiveJourney(alarm.trainNumber);
      if (!journey || !journey.currentLocation) continue;

      const station = journey.stations.find(
        (s) => s.code === alarm.stationCode || s.name.toLowerCase() === (alarm.stationName || '').toLowerCase()
      );
      if (!station || !station.lat || !station.lng) continue;

      if (station.status === 'passed') {
        await Alarm.findByIdAndUpdate(alarm._id, { active: false });
        continue;
      }

      const distKm = haversineKm(
        journey.currentLocation.lat,
        journey.currentLocation.lng,
        station.lat,
        station.lng
      );

      const shouldFire =
        alarm.mode === 'arrival'
          ? station.status === 'current'
          : distKm <= alarm.distanceKm;

      if (shouldFire && !alarm.notifiedAt) {
        if (alarm.pushSubscription && pushReady) {
          await webpush
            .sendNotification(
              alarm.pushSubscription,
              JSON.stringify({
                title: `${alarm.trainName || 'Train'} approaching ${alarm.stationName || alarm.stationCode}`,
                body:
                  alarm.mode === 'arrival'
                    ? `${alarm.trainName || `Train ${alarm.trainNumber}`} has arrived at ${alarm.stationName || alarm.stationCode}.`
                    : `${alarm.trainName || `Train ${alarm.trainNumber}`} is now within ${Math.round(distKm)} km of ${alarm.stationName || alarm.stationCode}.`,
                url: `/train/${alarm.trainNumber}`,
              })
            )
            .catch(() => {});
        }
        await Alarm.findByIdAndUpdate(alarm._id, {
          notifiedAt: new Date(),
          lastNotifiedKm: Math.round(distKm),
          active: false,
        });
      }
    } catch {
      // individual alarm failures should not block the rest
    }
  }
}

module.exports = router;
module.exports.checkAlarms = checkAlarms;
module.exports.pushReady = pushReady;
module.exports.vapidPublicKey = config.vapid.publicKey;
