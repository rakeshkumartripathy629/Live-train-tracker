// Phase 10.1 — Admin API for the RailRadar key store.
//
// GET    /api/v1/admin/railradar-keys            — list keys (masked).
// POST   /api/v1/admin/railradar-keys            — add a key (optional ?test=1
//                                                   probes it against RailRadar
//                                                   before persisting).
// DELETE /api/v1/admin/railradar-keys/:id        — revoke a key.
//
// Every route is gated by x-internal-token (the Next.js proxy adds it
// server-side after checking the NextAuth session). The key is never exposed
// in full to the browser.

const { Router } = require("express");
const config = require("../config/env");
const RailRadarKey = require("../models/RailRadarKey");
const { invalidateCache } = require("../services/railradar-keys");

const router = Router();

function requireInternal(req, res) {
  if (!config.internalToken) {
    res
      .status(503)
      .json({ success: false, error: "Internal API token not configured" });
    return false;
  }
  if (req.get("x-internal-token") !== config.internalToken) {
    res.status(403).json({ success: false, error: "Forbidden" });
    return false;
  }
  return true;
}

function mask(key) {
  if (!key) return "";
  if (key.length <= 10) return key.slice(0, 3) + "…";
  return key.slice(0, 6) + "…" + key.slice(-4);
}

function toPublic(doc) {
  return {
    id: String(doc._id),
    label: doc.label || "",
    status: doc.status,
    masked: mask(doc.key),
    usedAt: doc.usedAt || null,
    createdAt: doc.createdAt || null,
  };
}

async function testRailRadarKey(key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(
      `${config.railradar.baseUrl}/lookup/stations`,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      }
    );
    if (res.ok) return { ok: true };
    const json = await res.json().catch(() => null);
    return {
      ok: false,
      status: res.status,
      message: json?.error?.message || `RailRadar error (${res.status})`,
    };
  } catch (err) {
    return { ok: false, message: err.message };
  } finally {
    clearTimeout(timer);
  }
}

router.get("/railradar-keys", async (req, res) => {
  if (!requireInternal(req, res)) return;
  const docs = await RailRadarKey.find().sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: docs.map(toPublic) });
});

router.post("/railradar-keys", async (req, res) => {
  if (!requireInternal(req, res)) return;
  const { key, label } = req.body || {};
  const raw = String(key || "").trim();
  if (!raw) {
    return res
      .status(400)
      .json({ success: false, error: { code: "KEY_REQUIRED", message: "key is required" } });
  }

  if (req.query.test === "1") {
    const probe = await testRailRadarKey(raw);
    if (!probe.ok) {
      return res.status(400).json({
        success: false,
        error: {
          code: "KEY_REJECTED",
          message: `RailRadar rejected this key: ${probe.message || `HTTP ${probe.status}`}`,
        },
      });
    }
  }

  const exists = await RailRadarKey.findOne({ key: raw }).lean();
  if (exists) {
    await RailRadarKey.updateOne(
      { _id: exists._id },
      { $set: { status: "active", label: String(label || "").trim() } }
    );
  } else {
    await RailRadarKey.create({
      key: raw,
      label: String(label || "").trim(),
      addedBy: req.get("x-user-id") || "",
    });
  }
  invalidateCache();

  const doc = exists || (await RailRadarKey.findOne({ key: raw }).lean());
  res.json({ success: true, data: toPublic(doc) });
});

router.delete("/railradar-keys/:id", async (req, res) => {
  if (!requireInternal(req, res)) return;
  const doc = await RailRadarKey.findByIdAndUpdate(req.params.id, {
    $set: { status: "revoked" },
  }).lean();
  if (!doc) {
    return res
      .status(404)
      .json({ success: false, error: { code: "NOT_FOUND", message: "key not found" } });
  }
  invalidateCache();
  res.json({ success: true, data: toPublic({ ...doc, status: "revoked" }) });
});

module.exports = router;
