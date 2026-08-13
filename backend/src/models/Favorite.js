const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, index: true },
    trainNumber: { type: String, required: true },
    trainName: { type: String, default: '' },
    fromCode: { type: String, default: '' },
    fromName: { type: String, default: '' },
    toCode: { type: String, default: '' },
    toName: { type: String, default: '' },
  },
  { timestamps: true }
);

favoriteSchema.index({ deviceId: 1, trainNumber: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', favoriteSchema);
