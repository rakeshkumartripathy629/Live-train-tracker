const { Schema, model } = require('mongoose');

// Station registry (Phase 8 §8, §11, §43). Persisted station references are
// seeded ONLY from the real RailRadar stations map (/lookup/stations) — code +
// name are the only fields the source provides. Nothing else is fabricated:
//   - city / state stay null (source provides no such field)
//   - lat / lng stay null (the source exposes no verified coordinates; the
//     frontend must never render a map pin at an unverified position)
//   - `location` (GeoJSON Point) is only ever set when real coordinates exist,
//     so the 2dsphere index stays honest (empty today).
const StationSchema = new Schema(
  {
    code: { type: String, required: true }, // e.g. 'NDLS'
    name: { type: String, required: true },
    normalizedName: { type: String, default: null }, // lowercase name for search
    city: { type: String, default: null },
    state: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    location: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: { type: [Number], default: undefined },
    },
    verified: { type: Boolean, default: false },
    source: { type: String, default: 'RAILRADAR' },
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

StationSchema.index({ code: 1 }, { unique: true });
StationSchema.index({ normalizedName: 1 });
StationSchema.index({ city: 1 });
// Geospatial index (Phase 8 §37). Sparse + partial: only stations with verified
// coordinates are indexed. With no verified source today this stays empty —
// nearby lookups therefore report COORDINATES_UNAVAILABLE instead of guessing.
StationSchema.index({ location: '2dsphere' }, { sparse: true });

module.exports = model('Station', StationSchema);
