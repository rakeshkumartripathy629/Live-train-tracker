// Notification provider abstraction (Phase 5 §29–§31).
//
// A single `send({ channel, userId, payload })` entry point keeps provider
// specifics out of the worker. Only Web Push is actually wired (VAPID keys);
// EMAIL / SMS / WHATSAPP return NOT_CONFIGURED and are never marked SENT.
// Provider failures surface with `retryable` / `permanent` flags so the worker
// can apply the right retry policy (§42–§43).

const webpush = require('web-push');
const config = require('../../config/env');
const PushSubscription = require('../../models/PushSubscription');

function vapidConfigured() {
  return Boolean(config.vapid.publicKey && config.vapid.privateKey && config.vapid.subject);
}

let initialized = false;
function ensureVapid() {
  if (!vapidConfigured()) return false;
  if (!initialized) {
    webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
    initialized = true;
  }
  return true;
}

/**
 * Channel availability. Only PUSH can ever be ready in this phase.
 */
function isChannelConfigured(channel) {
  if (channel === 'PUSH') return ensureVapid();
  return false;
}

/**
 * @param {object} [opts]
 * @param {Function} [opts.transport] injectable transport for tests —
 *   (subscription, payloadString) => Promise<result>. Defaults to web-push.
 */
function createProvider({ transport } = {}) {
  const sendRaw = transport || (async (subscription, payloadString) => webpush.sendNotification(subscription, payloadString));

  async function sendPush(userId, payload) {
    if (!ensureVapid()) {
      return { status: 'NOT_CONFIGURED', error: 'VAPID keys not configured' };
    }
    const subs = await PushSubscription.find({ userId, active: true }).lean();
    if (!subs.length) {
      return { status: 'SKIPPED', error: 'no active push subscription for user' };
    }

    const payloadString = JSON.stringify(payload);
    let sent = 0;
    let permanentCount = 0;
    let firstError = null;
    let retryable = false;

    for (const sub of subs) {
      try {
        await sendRaw({ endpoint: sub.endpoint, keys: sub.keys }, payloadString);
        sent += 1;
        await PushSubscription.updateOne({ endpoint: sub.endpoint }, { $set: { lastUsedAt: new Date() } });
      } catch (err) {
        const code = err && err.statusCode;
        if (code === 404 || code === 410) {
          // Permanently invalid/expired subscription → deactivate (§42).
          permanentCount += 1;
          await PushSubscription.updateOne(
            { endpoint: sub.endpoint },
            { $set: { active: false, deactivatedReason: `push rejected ${code}`, lastUsedAt: new Date() } }
          );
        } else {
          retryable = true;
          firstError = firstError || String((err && err.message) || err).slice(0, 300);
        }
      }
    }

    if (sent > 0) {
      return { status: 'SENT', providerMessageId: `push-${Date.now()}-${sent}`, sentCount: sent };
    }
    if (permanentCount > 0) {
      return { status: 'FAILED', error: `subscription rejected permanently (${permanentCount})`, permanent: true };
    }
    if (retryable) {
      return { status: 'FAILED', error: firstError || 'push delivery failed', retryable: true };
    }
    return { status: 'SKIPPED', error: 'no subscription delivered' };
  }

  return {
    isChannelConfigured: (channel) => (channel === 'PUSH' ? ensureVapid() : false),
    async send({ channel, userId, payload }) {
      if (channel === 'PUSH') return sendPush(userId, payload);
      return { status: 'NOT_CONFIGURED', error: `${channel} channel is not configured in this phase` };
    },
  };
}

module.exports = { createProvider, isChannelConfigured, vapidConfigured };
