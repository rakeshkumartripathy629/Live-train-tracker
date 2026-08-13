const { Schema, model } = require('mongoose');

// Web Push subscriptions (Phase 5 §27–§28). One document per device: the
// endpoint is the unique device identity, so subscribing from a new device
// never overwrites an existing one. The backend notification worker reads these
// to deliver push payloads to every device of the user.

const PushSubscriptionSchema = new Schema(
  {
    userId: { type: String, required: true },
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    device: { type: String, default: 'unknown' },
    active: { type: Boolean, default: true },
    deactivatedReason: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

PushSubscriptionSchema.index({ userId: 1 });
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

module.exports = model('PushSubscription', PushSubscriptionSchema);
