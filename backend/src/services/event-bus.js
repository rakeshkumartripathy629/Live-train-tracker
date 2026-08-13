// In-process publish/subscribe event bus (Phase 7).
//
// The tracking worker and the SSE stream server share one Node process in the
// current Docker deployment (single backend container), so process-local
// delivery is the zero-latency primary path for real-time train events.
//
// This is deliberately NOT the only source of truth: shared Redis snapshots
// (`tracking:last:{targetId}`) remain the durable record, and the SSE stream
// reconciles against them on an interval (stream.js) so missed/in-flight
// events are recovered on reconnect and across future multi-instance
// deployments. No pub/sub protocol (Upstash is REST-only) is used here (§1).

const topics = new Map();

function subscribe(topic, listener) {
  let set = topics.get(topic);
  if (!set) {
    set = new Set();
    topics.set(topic, set);
  }
  set.add(listener);
  return () => unsubscribe(topic, listener);
}

function unsubscribe(topic, listener) {
  const set = topics.get(topic);
  if (!set) return;
  set.delete(listener);
  if (set.size === 0) topics.delete(topic);
}

function publish(topic, payload) {
  const set = topics.get(topic);
  if (!set || set.size === 0) return 0;
  let delivered = 0;
  for (const listener of [...set]) {
    delivered += 1;
    try {
      listener(payload);
    } catch (err) {
      // A listener failure must never break other listeners or the worker.
      // Errors are surfaced through the stream metrics instead of thrown.
      // eslint-disable-next-line no-console
      console.error('[event-bus] listener error:', String(err && err.message || err));
    }
  }
  return delivered;
}

function listenerCount(topic) {
  const set = topics.get(topic);
  return set ? set.size : 0;
}

function topicsSize() {
  return topics.size;
}

function totalListeners() {
  let total = 0;
  for (const set of topics.values()) total += set.size;
  return total;
}

module.exports = { subscribe, publish, listenerCount, topicsSize, totalListeners };
