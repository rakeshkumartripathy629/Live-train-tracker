const { Schema, model } = require('mongoose');

// Historical live-train observations captured by the tracking worker (Phase 4).
// Every field stores the REAL value reported by RailRadar at the time of the
// fetch. Missing values are null — nothing here is estimated or interpolated.

const TrainSnapshotSchema = new Schema(
  {
    trainNumber: { type: String, required: true, index: true },
    trainName: { type: String, default: null },
    journeyDate: { type: String, required: true }, // YYYY-MM-DD (identity date)
    status: { type: String, required: true, index: true },
    currentStationCode: { type: String, default: null },
    currentStationName: { type: String, default: null },
    nextStationCode: { type: String, default: null },
    nextStationName: { type: String, default: null },
    previousStationCode: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    speedKmh: { type: Number, default: null },
    delayMinutes: { type: Number, default: null },
    platform: { type: String, default: null },
    completionFraction: { type: Number, default: null },
    coveredDistanceKm: { type: Number, default: null },
    remainingDistanceKm: { type: Number, default: null },
    totalDistanceKm: { type: Number, default: null },
    observedAt: { type: Date, required: true }, // source observation time (lastUpdatedAt)
    fetchedAt: { type: Date, required: true }, // when we polled
    dataQuality: { type: String, enum: ['LIVE', 'PARTIAL', 'STALE'], default: 'PARTIAL' },
    source: { type: String, default: 'RAILRADAR' },
    dedupKey: { type: String, required: true },
  },
  { timestamps: true }
);

// Phase 4 spec §16 — unique sparse index on the deterministic dedup key is the
// DB-level guarantee that a (train, date, bucket, status, station) row exists
// only once even if two workers race.
TrainSnapshotSchema.index({ dedupKey: 1 }, { unique: true, sparse: true });
TrainSnapshotSchema.index({ trainNumber: 1, journeyDate: 1, observedAt: 1 });
TrainSnapshotSchema.index({ trainNumber: 1, journeyDate: 1 });
TrainSnapshotSchema.index({ observedAt: 1 });
TrainSnapshotSchema.index({ journeyDate: 1, status: 1 });

module.exports = model('TrainSnapshot', TrainSnapshotSchema);
