// Centralized notification message generator (Phase 5 §32).
// Every message is built ONLY from real event values. No fabricated numbers.

function fmtTime(iso) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

function formatDelay(minutes) {
  if (typeof minutes !== 'number') return '—';
  if (minutes === 0) return 'on time';
  return `${minutes} min late`;
}

function buildMessage(event, ctx = {}) {
  const trainNumber = event.trainNumber || ctx.trainNumber || '';
  const trainLabel = trainNumber ? `Train ${trainNumber}` : 'Your train';
  const { payload = {} } = event;
  const stationName = event.stationName || ctx.stationName || null;
  const stationCode = event.stationCode || null;

  switch (event.type) {
    case 'TRAIN_STARTED':
      return {
        title: `${trainLabel} started`,
        body: `${trainLabel} has started its journey.`,
      };
    case 'TRAIN_DEPARTED':
      return {
        title: `${trainLabel} departed`,
        body: stationName
          ? `${trainLabel} has departed from ${stationName}${stationCode ? ` (${stationCode})` : ''}.`
          : `${trainLabel} has departed from its current station.`,
      };
    case 'TRAIN_ARRIVED':
      return {
        title: `${trainLabel} arrived`,
        body: stationName
          ? `${trainLabel} has arrived at ${stationName}${stationCode ? ` (${stationCode})` : ''}.`
          : `${trainLabel} has arrived at a station.`,
      };
    case 'DELAY_STARTED':
      return {
        title: `${trainLabel} delayed`,
        body: `${trainLabel} is now ${payload.currentDelayMinutes} min late.`,
      };
    case 'DELAY_INCREASED':
      return {
        title: `${trainLabel} delay increased`,
        body: `${trainLabel} is now ${payload.currentDelayMinutes} min late, an increase of ${payload.differenceMinutes} min.`,
      };
    case 'DELAY_REDUCED':
      return {
        title: `${trainLabel} delay reduced`,
        body: `${trainLabel} is now ${payload.currentDelayMinutes} min late, down ${payload.differenceMinutes} min.`,
      };
    case 'DESTINATION_APPROACHING':
      return {
        title: `${trainLabel} approaching destination`,
        body: stationName
          ? `${trainLabel} is approximately ${payload.remainingDistanceKm} km from ${stationName}.`
          : `${trainLabel} is approximately ${payload.remainingDistanceKm} km from your destination.`,
      };
    case 'JOURNEY_COMPLETED':
      return {
        title: `${trainLabel} journey completed`,
        body: `${trainLabel} has reached your destination.`,
      };
    case 'TRAIN_CANCELLED':
      return {
        title: `${trainLabel} cancelled`,
        body: `${trainLabel} has been cancelled.`,
      };
    case 'TRAIN_DIVERTED':
      return {
        title: `${trainLabel} diverted`,
        body: `${trainLabel} has been diverted from its normal route.`,
      };
    case 'LIVE_DATA_STALE':
      return {
        title: `${trainLabel} live tracking stale`,
        body: `Live data for ${trainLabel} is temporarily unavailable. We will notify you when tracking recovers.`,
      };
    case 'LIVE_DATA_RECOVERED':
      return {
        title: `${trainLabel} live tracking recovered`,
        body: `Live tracking for ${trainLabel} is back online.`,
      };
    default:
      return null;
  }
}

/**
 * Resolve the deep-link for a notification. Journey pages are the natural
 * landing target for user alerts.
 */
function notificationUrl(event, journeyId) {
  if (journeyId) return `/journeys/${journeyId}`;
  if (event.trainNumber) return `/train/${event.trainNumber}`;
  return '/notifications';
}

module.exports = { buildMessage, notificationUrl, formatDelay, fmtTime };
