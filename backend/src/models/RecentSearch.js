const mongoose = require('mongoose');

const recentSearchSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, index: true },
    type: { type: String, enum: ['train', 'station', 'pnr'], required: true },
    query: { type: String, required: true },
    label: { type: String, default: '' },
    extra: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

recentSearchSchema.index({ deviceId: 1, createdAt: -1 });

module.exports = mongoose.model('RecentSearch', recentSearchSchema);
