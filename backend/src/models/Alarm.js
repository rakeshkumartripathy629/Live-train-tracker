const mongoose = require('mongoose');

const alarmSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, index: true },
    trainNumber: { type: String, required: true },
    trainName: { type: String, default: '' },
    stationCode: { type: String, required: true },
    stationName: { type: String, default: '' },
    distanceKm: { type: Number, required: true, min: 5, max: 500, default: 20 },
    mode: { type: String, enum: ['distance', 'arrival'], default: 'distance' },
    pushSubscription: { type: mongoose.Schema.Types.Mixed, default: null },
    lastNotifiedKm: { type: Number, default: null },
    active: { type: Boolean, default: true },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

alarmSchema.index({ deviceId: 1, active: 1 });
alarmSchema.index({ stationCode: 1, active: 1 });

module.exports = mongoose.model('Alarm', alarmSchema);
