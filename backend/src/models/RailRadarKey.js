// Phase 10.1 — RailRadar API key store.
//
// RailRadar free keys expire after a small request budget (the user must
// regenerate them from the RailRadar console). Keeping the keys in MongoDB
// instead of baked into env lets the owner add/revoke keys from a web page
// (no .env edit, no Docker rebuild, no restart) and lets the backend rotate
// automatically when one key is exhausted.

const mongoose = require("mongoose");

const railRadarKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["active", "exhausted", "revoked"],
      default: "active",
    },
    label: { type: String, default: "", trim: true, maxlength: 80 },
    addedBy: { type: String, default: "" },
    usedAt: { type: Date },
  },
  { timestamps: true }
);

railRadarKeySchema.index({ status: 1, createdAt: -1 });

module.exports =
  mongoose.models.RailRadarKey ||
  mongoose.model("RailRadarKey", railRadarKeySchema);
