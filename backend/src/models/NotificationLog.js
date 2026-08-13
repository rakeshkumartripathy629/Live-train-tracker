const { Schema, model } = require('mongoose');

// Notification history + delivery state (Phase 5). Every delivery attempt is
// recorded here; the Redis queue only holds retry scheduling. The unique sparse
// index on dedupeKey is the DB-level guarantee that one event produces at most
// one notification even across multiple worker instances.

const NOTIFICATION_STATUS = {
  QUEUED: 'QUEUED',
  SENDING: 'SENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
};

const NotificationLogSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    journeyId: { type: String, default: null },
    trainNumber: { type: String, default: null },
    trainName: { type: String, default: null },
    eventType: { type: String, required: true },
    channel: { type: String, default: 'PUSH' },
    message: { type: String, default: '' },
    status: { type: String, enum: Object.values(NOTIFICATION_STATUS), default: NOTIFICATION_STATUS.QUEUED },
    providerMessageId: { type: String, default: null },
    error: { type: String, default: null },
    dedupeKey: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    sentAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

NotificationLogSchema.index({ userId: 1, createdAt: -1 });
NotificationLogSchema.index({ userId: 1, readAt: 1 });
NotificationLogSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

module.exports = { NotificationLog: model('NotificationLog', NotificationLogSchema), NOTIFICATION_STATUS };
