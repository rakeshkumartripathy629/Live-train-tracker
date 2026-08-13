const { Schema, model } = require('mongoose');

// Read/update view over the user journeys collection (created by the Next.js
// API routes). strict:false tolerates fields owned by the frontend driver; the
// worker ONLY touches lastTrackedAt / completedAt / status and never overrides
// user-owned fields.
const JourneySchema = new Schema(
  {
    userId: { type: String, index: true },
    trainNumber: { type: String, index: true },
    trainName: { type: String },
    origin: { type: Schema.Types.Mixed },
    destination: { type: Schema.Types.Mixed },
    boardingStationCode: { type: String },
    boardingStationName: { type: String },
    destinationStationCode: { type: String },
    destinationStationName: { type: String },
    journeyDate: { type: String },
    status: { type: String, index: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    lastTrackedAt: { type: Date },
  },
  { collection: 'journeys', timestamps: true, strict: false }
);

// Scheduler discovery query: all journeys needing tracking by status + date.
JourneySchema.index({ status: 1, journeyDate: 1 });
JourneySchema.index({ status: 1, trainNumber: 1 });

module.exports = model('Journey', JourneySchema);
