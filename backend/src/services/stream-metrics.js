// In-process metrics for the Phase 7 SSE stream. Tracked in memory because the
// stream is process-local; exported for the /stream/metrics endpoint (guarded
// by the internal token) and for phase7 tests.

const events = {};

function resetEvents() {
  for (const key of Object.keys(events)) delete events[key];
}

function track(event, delta) {
  const name = String(event).slice(0, 60);
  const entry = events[name] || (events[name] = { delivered: 0, dropped: 0, totalMs: 0, count: 0 });
  entry.delivered += delta.delivered || 0;
  entry.dropped += delta.dropped || 0;
  if (delta.latencyMs !== undefined) {
    entry.totalMs += delta.latencyMs;
    entry.count += 1;
  }
}

function snapshot() {
  const list = [];
  for (const [name, e] of Object.entries(events)) {
    list.push({
      event: name,
      delivered: e.delivered,
      dropped: e.dropped,
      avgLatencyMs: e.count ? Math.round(e.totalMs / e.count) : null,
    });
  }
  return list;
}

module.exports = {
  activeConnections: 0,
  opened: 0,
  closed: 0,
  reconnects: 0,
  lastError: null,
  events,
  track,
  snapshot,
  resetEvents,
};
