const { cached } = require('./cache');

const CONFIRMTKT_BASE = 'https://www.confirmtkt.com/api/pnr/status';

async function fetchPnr(pnr) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${CONFIRMTKT_BASE}/${pnr}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (RailGaadi/1.0)', Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ConfirmTKT PNR API error (${res.status})`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseStatus(status) {
  const s = (status || '').toUpperCase();
  if (s.startsWith('CNF')) return 'CNF';
  if (s.startsWith('RAC')) return 'RAC';
  if (s.startsWith('WL') || s.startsWith('GNWL') || s.startsWith('PQWL') || s.startsWith('RLWL')) return 'WL';
  if (s.startsWith('RE') || s.startsWith('RS')) return 'RAC';
  return s || 'UNKNOWN';
}

function normalisePassenger(p, index) {
  const bookingStatus = p?.BookingStatus || p?.bookingStatus || p?.Status || '';
  const currentStatus = p?.CurrentStatus || p?.currentStatus || bookingStatus;
  const bookingBerth = p?.BookingBerthNo || p?.BerthNo || p?.bookingBerthNo || '';
  const currentBerth = p?.CurrentBerthNo || p?.currentBerthNo || bookingBerth;
  const bookingCoach = p?.BookingCoachId || p?.CoachNo || p?.bookingCoachNo || '';
  const currentCoach = p?.CurrentCoachId || p?.CurrentCoachNo || p?.currentCoachNo || bookingCoach;

  return {
    number: p?.Number || p?.number || index + 1,
    bookingStatus,
    currentStatus,
    bookingBerth,
    currentBerth,
    bookingCoach,
    currentCoach,
    type: parseStatus(currentStatus),
  };
}

function normalisePnr(raw, pnr) {
  if (!raw || raw.Error || raw.ErrorCode) {
    const err = raw?.Error || 'PNR not found or flushed';
    const error = new Error(err);
    error.code = 'PNR_NOT_FOUND';
    throw error;
  }

  const passengers = Array.isArray(raw.PassengerStatus)
    ? raw.PassengerStatus.map(normalisePassenger)
    : [];

  const confirmedCount = passengers.filter((p) => p.type === 'CNF').length;
  const probability =
    passengers.length === 0
      ? 0
      : Math.round((confirmedCount / passengers.length) * 100);

  return {
    pnr,
    train: {
      number: raw.TrainNo || raw.TrainNumber || '',
      name: raw.TrainName || '',
      from: raw.From || '',
      fromName: raw.SourceName || raw.FromStnActual || '',
      to: raw.To || '',
      toName: raw.DestinationName || raw.ToStnActual || '',
      departureTime: raw.DepartureTime || '',
      arrivalTime: raw.ArrivalTime || '',
      journeyDate: raw.Doj ? raw.Doj.split('T')[0] : '',
      bookingDate: raw.BookingDate ? raw.BookingDate.split('T')[0] : '',
      quota: raw.Quota || '',
      className: raw.Class || '',
      chartPrepared: Boolean(raw.ChartPrepared),
      chartStatus: raw.ChartPrepared ? 'Prepared' : 'Not Prepared',
      passengerCount: raw.PassengerCount ?? passengers.length,
      coachPosition: raw.CoachPosition || null,
      expectedPlatform: raw.ExpectedPlatformNo || null,
      trainStatus: raw.TrainStatus || null,
      trainCancelled: Boolean(raw.TrainCancelledFlag),
      bookingFare: raw.BookingFare ?? null,
      ticketFare: raw.TicketFare ?? null,
      boardingPoint: raw.BoardingPoint || raw.BoardingStationName || '',
      reservationUpto: raw.ReservationUptoName || raw.ReservationUpto || '',
    },
    passengers,
    summary: {
      confirmed: confirmedCount,
      rac: passengers.filter((p) => p.type === 'RAC').length,
      waiting: passengers.filter((p) => p.type === 'WL').length,
      probability,
    },
  };
}

/**
 * PNR status lookup with a graceful fallback when the public API is down.
 */
async function getPnrStatus(pnr) {
  return cached(`pnr:${pnr}`, 300, async () => {
    try {
      const raw = await fetchPnr(pnr);
      return normalisePnr(raw, pnr);
    } catch (err) {
      console.warn('[pnr] ConfirmTKT failed, returning demo:', err.message);
      return demoPnr(pnr);
    }
  });
}

function demoPnr(pnr) {
  return {
    pnr,
    demo: true,
    train: {
      number: '12951',
      name: 'New Delhi Tejas Rajdhani Express',
      from: 'MMCT',
      fromName: 'Mumbai Central',
      to: 'NDLS',
      toName: 'New Delhi',
      departureTime: '17:00',
      arrivalTime: '08:32',
      journeyDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
      bookingDate: new Date().toISOString().split('T')[0],
      quota: 'GN',
      className: '3A',
      chartPrepared: false,
      chartStatus: 'Not Prepared',
      passengerCount: 3,
      coachPosition: 'Engine-H1-A1-A2-B1-B2-B3-B4-PC-S1-S2-S3-S4-S5-S6-S7-S8-S9-S10-S11-S12-DL1',
      expectedPlatform: '2',
      trainStatus: null,
      trainCancelled: false,
      bookingFare: 2965,
      ticketFare: 2965,
      boardingPoint: 'Mumbai Central',
      reservationUpto: 'New Delhi',
    },
    passengers: [
      {
        number: 1,
        bookingStatus: 'CNF',
        currentStatus: 'CNF',
        bookingBerth: '18',
        currentBerth: '18',
        bookingCoach: 'B1',
        currentCoach: 'B1',
        type: 'CNF',
      },
      {
        number: 2,
        bookingStatus: 'CNF',
        currentStatus: 'CNF',
        bookingBerth: '19',
        currentBerth: '19',
        bookingCoach: 'B1',
        currentCoach: 'B1',
        type: 'CNF',
      },
      {
        number: 3,
        bookingStatus: 'WL 8',
        currentStatus: 'WL 3',
        bookingBerth: '',
        currentBerth: '',
        bookingCoach: '',
        currentCoach: '',
        type: 'WL',
      },
    ],
    summary: { confirmed: 2, rac: 0, waiting: 1, probability: 67 },
  };
}

module.exports = { getPnrStatus };
