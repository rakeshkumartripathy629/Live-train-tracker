const { Schema, model } = require('mongoose');

// User-configured alert rules (Phase 5). Created by the Next.js API routes
// (authenticated via NextAuth); the backend worker only READS these to decide
// whether an observation should produce a notification. Ownership is always
// scoped by userId + verified journey ownership — never accepted from clients.
//
// journeyId is stored as the journey _id hex string so the same document works
// across the native MongoDB driver (Next.js) and mongoose (backend worker).

const ALERT_TYPES = [
  'DELAY_THRESHOLD', // threshold = minutes; fire when delay crosses upward
  'DELAY_INCREASE', // threshold = minimum increase minutes (0 = any)
  'DELAY_REDUCTION', // threshold = minimum reduction minutes (0 = any)
  'TRAIN_STARTED',
  'TRAIN_DEPARTED',
  'TRAIN_ARRIVED',
  'DESTINATION_APPROACHING', // threshold = km remaining to destination
  'JOURNEY_COMPLETED',
  'TRAIN_CANCELLED',
  'TRAIN_DIVERTED',
  'LIVE_DATA_STALE',
];

const CHANNELS = ['PUSH'];

const AlertSchema = new Schema(
  {
    userId: { type: String, required: true },
    journeyId: { type: String, required: true },
    trainNumber: { type: String, required: true },
    alertType: { type: String, required: true, enum: ALERT_TYPES },
    targetStationCode: { type: String, default: null },
    targetStationName: { type: String, default: null },
    threshold: { type: Number, default: null },
    channel: { type: String, required: true, enum: CHANNELS, default: 'PUSH' },
    enabled: { type: Boolean, default: true },
    lastTriggeredAt: { type: Date, default: null },
    triggerCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

AlertSchema.index({ userId: 1, enabled: 1 });
AlertSchema.index({ journeyId: 1, enabled: 1 });
AlertSchema.index({ trainNumber: 1, enabled: 1 });

module.exports = { Alert: model('Alert', AlertSchema), ALERT_TYPES, CHANNELS };
