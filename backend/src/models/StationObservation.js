const { Schema, model } = require('mongoose');

// Real station observations (Phase 8 §29–§34). Derived in the tracking worker
// from genuinely-new REAL TrainSnapshots only — the same snapshots the alert
// engine and SSE train stream consume. Every field is copied from the source;
// null stays null (no fabricated platforms, delays or times).
const EVENT_TYPES = ['AT_STATION', 'ARRIVED', 'DEPARTED'];

const StationObservationSchema = new Schema(
  {
    // Deterministic dedupe key (train, date, station, event, observation bucket)
    // — unique index is the DB-level guarantee a (station, event, time) row
    // exists only once even across racing workers (§33).
    dedupKey: { type: String, required: true },
    trainNumber: { type: String, required: true },
    trainName: { type: String, default: null },
    journeyDate: { type: String, required: true }, // YYYY-MM-DD identity date
    stationCode: { type: String, required: true },
    stationName: { type: String, default: null },
    eventType: { type: String, required: true, enum: EVENT_TYPES },
    status: { type: String, default: null }, // snapshot status (real)
    delayMinutes: { type: Number, default: null }, // real source value or null
    platform: { type: String, default: null }, // real source value or null
    observedAt: { type: Date, required: true }, // source observation time
    fetchedAt: { type: Date, required: true }, // when the worker polled
    dataQuality: { type: String, enum: ['LIVE', 'PARTIAL', 'STALE'], default: 'PARTIAL' },
    source: { type: String, default: 'RAILRADAR' },
  },
  { timestamps: true }
);

StationObservationSchema.index({ dedupKey: 1 }, { unique: true, sparse: true });
StationObservationSchema.index({ stationCode: 1, observedAt: 1 });
StationObservationSchema.index({ stationCode: 1, eventType: 1, observedAt: 1 });
StationObservationSchema.index({ trainNumber: 1, journeyDate: 1, observedAt: 1 });
StationObservationSchema.index({ stationCode: 1, eventType: 1 });

module.exports = { StationObservation: model('StationObservation', StationObservationSchema), EVENT_TYPES };
