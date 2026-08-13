const INDIA_TZ = 'Asia/Kolkata';

function parseTime(val) {
  if (!val) return undefined;
  if (val.includes('T')) {
    try {
      return new Date(val).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: INDIA_TZ,
      });
    } catch {
      return val.split('T')[1]?.slice(0, 5) || val;
    }
  }
  return val;
}

function normaliseStatus(status) {
  switch (status) {
    case 'running':
      return 'running';
    case 'not-started':
      return 'not_started';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'running';
  }
}

function normaliseStopStatus(raw) {
  const r = (raw || '').toLowerCase();
  if (r === 'departed' || r === 'passed' || r === 'arrived') return 'passed';
  if (r === 'at-station') return 'current';
  return 'upcoming';
}

function interpolatePolyline(coords, pct) {
  if (!coords || coords.length === 0) return [77.2194, 28.643];
  if (coords.length === 1 || pct <= 0) return coords[0];
  if (pct >= 100) return coords[coords.length - 1];

  const distances = [0];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    total += Math.sqrt(dx * dx + dy * dy);
    distances.push(total);
  }
  if (total === 0) return coords[0];

  const target = (pct / 100) * total;
  for (let i = 1; i < coords.length; i++) {
    if (distances[i] >= target) {
      const segLen = distances[i] - distances[i - 1];
      const t = segLen > 0 ? (target - distances[i - 1]) / segLen : 0;
      return [
        coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]),
        coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1]),
      ];
    }
  }
  return coords[coords.length - 1];
}

function normaliseLive(raw, routeGeo) {
  const train = raw.train;
  const stationMap = new Map();
  if (train.source) stationMap.set(train.source.code, train.source);
  if (train.destination) stationMap.set(train.destination.code, train.destination);

  const relevantStops = (raw.route || []).filter((s) => s.isHalt || s.stationCode || s.station?.code);
  const totalDistanceKm = train.distance || Math.round(relevantStops[relevantStops.length - 1]?.distance || 0);

  const stations = relevantStops.map((stop) => {
    const code = stop.stationCode || stop.station?.code || '';
    const info = stationMap.get(code) || stop.station;
    const st = {
      code,
      name: stop.stationName || stop.station?.name || code,
      lat: info?.lat ?? 0,
      lng: info?.lng ?? 0,
      scheduledArrival: parseTime(stop.scheduledArrival || stop.arrival) || '--:--',
      scheduledDeparture: parseTime(stop.scheduledDeparture || stop.departure) || '--:--',
      actualArrival: parseTime(stop.actualArrival) || undefined,
      actualDeparture: parseTime(stop.actualDeparture) || undefined,
      delayMinutes: stop.delayArrival ?? stop.delayDeparture ?? 0,
      distanceKm: Math.round(stop.distance || 0),
      status: normaliseStopStatus(stop.status),
      platform: stop.platform,
    };
    if ((!st.lat || !st.lng) && routeGeo && routeGeo.length >= 2 && totalDistanceKm > 0) {
      const pct = Math.min(100, Math.max(0, (st.distanceKm / totalDistanceKm) * 100));
      const [lng, lat] = interpolatePolyline(routeGeo, pct);
      st.lat = lat;
      st.lng = lng;
    }
    return st;
  });

  const currentStation = stations.find((s) => s.status === 'current');
  const previousStation = [...stations].reverse().find((s) => s.status === 'passed');
  const nextStation = stations.find((s) => s.status === 'upcoming');

  const coveredKm = currentStation?.distanceKm || previousStation?.distanceKm || 0;
  const remainingKm = Math.max(0, totalDistanceKm - coveredKm);
  const completion = totalDistanceKm > 0 ? Math.min(100, (coveredKm / totalDistanceKm) * 100) : 0;

  let trainLat = raw.currentLocation?.lat;
  let trainLng = raw.currentLocation?.lng;
  if (!trainLat || !trainLng) {
    const posStation = currentStation || previousStation;
    if (posStation && posStation.lat && posStation.lng) {
      trainLat = posStation.lat;
      trainLng = posStation.lng;
    } else if (routeGeo && routeGeo.length >= 2) {
      const [lng, lat] = interpolatePolyline(routeGeo, completion);
      trainLng = lng;
      trainLat = lat;
    } else {
      trainLat = train.source?.lat || 28.643;
      trainLng = train.source?.lng || 77.2194;
    }
  }

  const nextHaltStation = nextStation;
  const etaStr = nextHaltStation?.scheduledArrival
    ? `${nextHaltStation.name} at ${nextHaltStation.scheduledArrival}`
    : 'Calculating...';

  return {
    trainId: raw.trainNumber,
    number: raw.trainNumber,
    name: raw.trainName,
    origin: { code: train.source?.code || '', name: train.source?.name || '' },
    destination: { code: train.destination?.code || '', name: train.destination?.name || '' },
    currentLocation: {
      lat: trainLat,
      lng: trainLng,
      heading: raw.currentLocation?.bearingDegrees ?? 45,
      speedKmh: Math.round(raw.currentLocation?.speedKmh ?? train.avgSpeed ?? 80),
      isMoving: raw.status === 'running',
    },
    status: normaliseStatus(raw.status),
    delayMinutes: raw.delayMinutes || 0,
    speedKmh: Math.round(raw.currentLocation?.speedKmh ?? train.avgSpeed ?? 80),
    distanceCoveredKm: coveredKm,
    remainingDistanceKm: remainingKm,
    totalDistanceKm,
    completionPercentage: Math.round(completion * 10) / 10,
    lastUpdated: raw.lastUpdatedAt || new Date().toISOString(),
    ETA: etaStr,
    previousStation,
    currentStation,
    nextStation,
    stations,
    routeGeometry: routeGeo || undefined,
  };
}

module.exports = { normaliseLive, parseTime };
