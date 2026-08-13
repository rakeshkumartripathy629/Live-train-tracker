# Phase 5 — Alert & Notification Engine: Final Report

Date: 2026-08-13 (IST)
Scope: production alert + notification engine on the Phase 4 real-snapshot worker.

> Post-restructure note (2026-08-13): the repo was split into `backend/` and
> `frontend/`. All Phase 5 frontend paths in this report (e.g.
> `components/alerts/JourneyAlerts.tsx`, `app/notifications/page.tsx`) are now
> relative to `frontend/`. Backend paths are unchanged under `backend/`.

---

## 1. What was built

A complete alert + notification engine that triggers **only** on real backend
train observations (RailRadar live snapshots persisted by the Phase 4 worker).
No dummy data, no fabricated events, no estimated positions or ETAs.

### Components

| Component | Location | Responsibility |
|---|---|---|
| Alert rules | `backend/src/models/Alert.js` | 11 user-configurable alert types, PUSH channel |
| Notification log | `backend/src/models/NotificationLog.js` | Delivery state machine + durable dedupe (unique sparse `dedupeKey`) |
| Push subscriptions | `backend/src/models/PushSubscription.js` | Per-device Web Push subscriptions |
| Event detector | `backend/src/workers/alerts/event-detector.js` | Pure transition detection between consecutive REAL snapshots |
| Message generator | `backend/src/workers/alerts/message-generator.js` | Human-readable push payloads + deep links |
| Rule matching | `backend/src/workers/alerts/alert-engine.js` | Loads only the alerts attached to the target's journeys, evaluates rules, enqueues |
| Notification provider | `backend/src/workers/alerts/notification-provider.js` | Web Push via VAPID; DI factory for tests; 404/410 → deactivate |
| Notification worker | `backend/src/workers/alerts/notification-worker.js` | Consumes Redis `notify:due` queue, retry backoff, status transitions |
| Observability | `backend/src/workers/alerts/metrics.js` | `alerts:stats:counters` hash (hincrby-only) |
| API (frontend) | `app/api/alerts*`, `app/api/notifications*` | NextAuth-authenticated user APIs (native driver) |
| UI | `components/alerts/JourneyAlerts.tsx`, `app/notifications/page.tsx`, `components/notifications/NotificationsBell.tsx`, updated `PushToggle` | Journey alert management, notification center, unread badge, push lifecycle |

### Integration into Phase 4 worker

`backend/src/workers/train-tracking/worker.js` now runs `runAlertPipeline(target,
snapshot, snapshotId)` **only when a genuinely new snapshot was persisted**
(`persistSnapshot` returns `{ written, snapshotId }`). `runCycle` also calls
`checkStaleTargets()` for targets that stopped producing data. The notification
worker starts in `server.js` and standalone `worker.js`; all three new model
indexes are synced at startup.

## 2. Alert types (11, all real-data only)

`DELAY_THRESHOLD`, `DELAY_INCREASE`, `DELAY_REDUCTION`, `TRAIN_STARTED`,
`TRAIN_DEPARTED`, `TRAIN_ARRIVED`, `DESTINATION_APPROACHING`,
`JOURNEY_COMPLETED`, `TRAIN_CANCELLED`, `TRAIN_DIVERTED`, `LIVE_DATA_STALE`.

- `DELAY_THRESHOLD` fires **only on upward crossing** (prev < threshold ≤ curr) —
  once per crossing, never spammed.
- `DESTINATION_APPROACHING` uses real schedule distances from the cached route
  (`getTrainDetails`) + the real current station; crossing-based (fires once per
  journey per threshold).
- `TRAIN_CANCELLED` / `TRAIN_DIVERTED` only when the source reports that status.
- `LIVE_DATA_STALE` fires once per stale episode per target (Redis flag
  `alerts:stale:{targetId}`); `LIVE_DATA_RECOVERED` is detected and counted but
  not alertable.

### Intentionally NOT implemented (documented in code)

- **ETA_CHANGED** — RailRadar exposes no ETA field; computing one would be
  estimation, which is forbidden.
- **TRAIN_APPROACHING** — requires real coordinates; RailRadar live sends no
  lat/lng. Never estimated.

## 3. Architecture decisions

- **User APIs = Next.js App Router routes** authenticated via
  `getSessionUserId()` (NextAuth JWT, `session.user.id` = users `_id`). Journey
  ownership is verified server-side; `userId` is never accepted from the body.
  Consistent with Phase 3 journeys/favorites.
- **Engine = backend worker** reads `alerts` / `notification_logs` /
  `push_subscriptions` from the shared MongoDB DB (`bandhansutra`). `journeyId`
  is stored as a hex string so native-driver (Next.js) and mongoose (backend)
  match on the same value.
- **Queue = Redis** (`notify:due` zset, `notify:job:{id}`, `notify:lock:{id}`,
  `notify:dedupe:{key}`, `alerts:stale:{targetId}`).
- **Dedupe = two layers**: Redis SETNX (fast, cross-instance) + MongoDB unique
  sparse index on `dedupeKey` (durable). `dedupeKey` is
  `{train}:{journey}:{event}:{station|GLOBAL}:{1-min-bucket}:{extra}` where
  `extra` carries the prev:curr delay pair / destination threshold / stale
  episode bucket — guaranteeing one notification per genuine event.
- **Retry**: exponential backoff base 30 s × 2^(attempt−1), cap 10 min, max 5.
  Permanent failures (web-push 404/410) → `FAILED` + subscription deactivated.
  Temporary → back to `QUEUED` and re-scheduled.
- **Rate limiting** (Next routes): lightweight in-memory fixed-window limiter
  (`lib/rate-limit.ts`) — acceptable for the long-lived Node server; documented.
- **Channels**: only `PUSH` is configured. EMAIL/SMS/WhatsApp return
  `NOT_CONFIGURED` and are never marked SENT.

## 4. Environment variables (backend/.env — see .env.example)

`ALERTS_ENABLED`, `TRAIN_STALE_THRESHOLD_SECONDS` (1800),
`NOTIFY_WORKER_INTERVAL_SECONDS` (10), `NOTIFY_MAX_RETRIES` (5),
`NOTIFY_RETRY_BASE_SECONDS` (30), `NOTIFY_QUEUE_TTL_SECONDS` (604800),
`NOTIFY_DEDUPE_TTL_SECONDS` (86400). Existing `VAPID_*` keys drive push.

## 5. API surface (Next.js, NextAuth)

- `GET /api/alerts?journeyId=` · `POST /api/alerts`
- `PATCH /api/alerts/[id]` (enable/disable, threshold) · `DELETE /api/alerts/[id]`
- `GET /api/notifications?limit=&before=` (cursor pagination)
- `POST /api/notifications/[id]/read`
- `GET/POST /api/notifications/preferences`
- `POST/DELETE /api/notifications/push/subscribe`

Backend `GET /api/v1/tracking/status` now includes an honest `alerts` block
(enabled, staleThreshold, workerInterval, maxRetries, pushConfigured, worker
status, counters).

## 6. UI

- `JourneyAlerts` panel on `/journeys/[id]`: add/toggle/delete alerts with
  thresholds and inline help.
- `/notifications` center: push device list + disable push, notification history
  with read state, status chips, mark-read / mark-all-read, deep links.
- `NotificationsBell` in the navbar with unread badge (authenticated only).
- `PushToggle` now registers/unregisters the subscription with the backend when
  signed in (still works anonymously for legacy alarms).

## 7. Tests

`backend/scripts/phase5-test.mjs` — **23/23 PASS** (0 failed, 0 skipped):

- Event detector: started/departed/arrived transitions, delay lifecycle,
  cancellation/diversion, missing-value safety, forbidden-events guarantee,
  staleness.
- Message generator, dedupe-key determinism, rule matching (threshold upward
  crossing, destination approaching crossing-once).
- Integration (real Mongo + Redis): enqueue → Mongo log + Redis job → dedupe
  (single log); worker delivery via injected web-push transport (SENT / 410
  deactivation / retryable backoff / unknown-job no-op).
- Backend status endpoint honesty.
- Security (full stack): 401 unauth, validation, ownership (B cannot read/patch/
  delete/use A's alerts/journeys), duplicate-alert 409, push subscribe/preferences
  lifecycle.

## 8. Regression (previous work unaffected)

- **Phase 3**: 26/26 PASS
- **Phase 4**: 15/15 PASS (incl. real RailRadar fetch + dedupe + snapshot
  persistence + journey e2e with the live worker)
- **Production build**: `next build` clean (0 errors, 0 stale vendor-chunk refs)

The Phase 4 worker continued to run normally during Phase 5 testing
(`snapshotsWritten`, `dedupPrevented`, worker uptime counters healthy).

## 9. Observability

- Alert counters (`alerts:stats:counters`): eventsDetected, alertsEvaluated,
  alertsMatched, notificationsQueued/Sent/Failed/Skipped, duplicatePrevented,
  staleEvents + provider latency.
- Honest `workerStatus` (running/stopped) + `lastError` on the status endpoint —
  no fake healthy responses.
- Errors never crash the tracking loop (pipeline errors are captured into
  `metrics.memory.lastError`).

## 10. Stop condition confirmed

Phase 5 is complete. No AI/ETA prediction, no admin dashboard, no billing/B2B,
no new WebSocket infrastructure was added. ETA_CHANGED and TRAIN_APPROACHING
remain intentionally unsupported because the real data source provides neither
an ETA nor coordinates (documented in `event-detector.js` / `types.js`).
