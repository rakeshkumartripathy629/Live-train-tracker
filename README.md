# RailGaadi — Live Train Tracker (Production-Ready)

Real-time Indian Railways tracking: **live map**, **PNR status**, **trains between stations**, **station live boards**, **coach position**, **full schedules**, **proximity alarms (Web Push)**, delay analytics and weather — built for web today and ready to power **Android & desktop** apps.

## Project Structure

```
project-root/
├── backend/                 # Node + Express + MongoDB + Redis + workers
│   ├── src/
│   │   ├── config/          # env, db (mongoose)
│   │   ├── middleware/      # error handling
│   │   ├── models/          # Alarm, Alert, Favorite, Journey, NotificationLog,
│   │   │                    #   PushSubscription, RecentSearch, TrainSnapshot
│   │   ├── routes/          # trains, stations, pnr, tracking, alarms, user
│   │   ├── services/        # railradar (API keys), normalize, pnr, cache, upstash
│   │   ├── workers/
│   │   │   ├── train-tracking/   # snapshot engine (real RailRadar data)
│   │   │   └── alerts/           # alert engine + notification worker (web-push)
│   │   ├── server.js        # Express server (port 4000)
│   │   └── worker.js        # standalone tracking worker entry
│   ├── scripts/             # phase4-test.mjs, phase5-test.mjs
│   ├── package.json
│   ├── .env.example
│   └── Dockerfile
│
├── frontend/                # Next.js 14 App Router (port 3000)
│   ├── app/                 # pages + Next.js API routes
│   ├── components/          # UI components
│   ├── features/            # maps, weather, terrain, analytics, favorites
│   ├── hooks/               # data hooks (react-query)
│   ├── lib/                 # api clients + server-side route helpers
│   ├── providers/           # auth + query providers
│   ├── public/              # manifest, service worker
│   ├── store/               # zustand stores
│   ├── styles/ types/ utils/
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   └── .env.example
│
├── package.json             # root convenience scripts (dev/build/test)
├── .gitignore
├── docker-compose.yml       # mongo + backend
└── README.md
```

## Architecture

```
┌──────────────────┐        ┌──────────────────────────────────────┐
│  Frontend (web)  │  HTTP  │         Backend (Node + Express)      │
│  Next.js 14      │ ──────▶ │  /api/v1/trains /pnr /stations        │
│  MapLibre,       │        │  /alarms /tracking /user              │
│  TanStack Query, │        │  RailRadar · ConfirmTKT · Web-Push    │
│  Zustand         │        │  MongoDB · Redis · workers            │
└──────────────────┘        └──────────────────────────────────────┘
```

- **Backend** — `backend/` (Node + Express + MongoDB + Redis). Holds all API keys server-side. REST API consumed by the frontend, and later by Android/desktop apps. Runs the live snapshot worker and the alert/notification worker.
- **Frontend** — `frontend/` (Next.js App Router). Talks to the backend through `NEXT_PUBLIC_API_URL`. NextAuth (email + password) lives in the Next.js app, so authentication behavior is unchanged.
- **Auth** — NextAuth.js (email + password) with MongoDB adapter. `users`, `sessions` collections live in the same MongoDB. When logged in, favorites / journeys / alerts sync to the user account (`deviceId = session.user.id`), so they follow you across devices.
- **Data sources**
  - RailRadar API — live tracking, route geometry, trains between stations, station boards, schedules, coach position (`backend/src/services/railradar.js`)
  - ConfirmTKT — PNR status (free, no key) with graceful demo fallback (`backend/src/services/pnr.js`)
  - OpenWeather / OpenTopography — weather & elevation (Next.js server routes, optional keys, server-side only)

## Quick Start

### 1. MongoDB (Docker)

```bash
docker compose up -d mongo
```

### 2. Backend

```bash
cd backend
npm install
copy .env.example .env        # Windows
#  - set RAILRADAR_API_KEY (get free key at https://railradar.in/developers)
#  - VAPID keys optional (alerts): npx web-push generate-vapid-keys
npm run dev                   # http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
npm install
copy .env.example .env.local  # set NEXT_PUBLIC_API_URL, NEXTAUTH_SECRET, MONGODB_URI
npm run dev                   # http://localhost:3000
```

### 4. Auth (optional but recommended)

```bash
# 1. Add to frontend/.env.local:
#    NEXTAUTH_URL=http://localhost:3000
#    NEXTAUTH_SECRET=<openssl rand -base64 32>
#    MONGODB_URI=<same as backend>
# 2. Register at http://localhost:3000/register, then sign in.
#    Logged-in users get favorites / alerts / journey history synced across devices.
```

Or run everything with Docker:

```bash
docker compose up --build     # mongo + backend
```

### Root convenience scripts

```bash
npm run dev:frontend          # cd frontend && npm run dev
npm run dev:backend           # cd backend && npm run dev
npm run build:frontend        # cd frontend && npm run build
npm run start:frontend        # cd frontend && npm start
npm run start:backend         # cd backend && npm start
```

## API Endpoints (backend :4000)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/trains/search?q=` | Search trains |
| GET | `/api/v1/trains/:number/live` | Live journey (normalized) |
| GET | `/api/v1/trains/:number` | Details + schedule + coach position |
| GET | `/api/v1/trains/:number/route` | Route geometry |
| GET | `/api/v1/trains/between/:from/:to` | Trains between stations |
| GET | `/api/v1/stations/search?q=` | Search stations |
| GET | `/api/v1/stations/:code/live?hours=4` | Station live board |
| GET | `/api/v1/pnr/:pnr` | PNR status (10-digit) |
| POST | `/api/v1/alarms` | Create proximity alarm |
| GET | `/api/v1/alarms?deviceId=` | List alarms |
| DELETE | `/api/v1/alarms/:id` | Remove alarm |
| GET/POST/DELETE | `/api/v1/user/favorites...` | Favorites (MongoDB) |
| GET/POST | `/api/v1/user/recent...` | Recent searches |
| GET | `/api/v1/push-key` | VAPID public key |
| GET | `/api/v1/tracking/status` | Live tracking worker health + metrics (backend :4000) |
| POST | `/api/v1/tracking/internal/tracking/test` | One-shot REAL tracking pipeline (needs `INTERNAL_API_TOKEN`, rate-limited) |

## API Endpoints (Next.js frontend :3000)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/auth/session` | Current auth session (Next.js) |
| POST | `/api/register` | Create account (Next.js) |
| GET/POST | `/api/favorites` | List / add favorites (Next.js, auth) |
| GET/DELETE | `/api/favorites/[trainNumber]` | Favorite status / remove (Next.js, auth) |
| POST | `/api/favorites/live` | Live status for own favorites, batched (Next.js, auth) |
| GET/POST | `/api/journeys` | List / create journeys (Next.js, auth) |
| GET | `/api/journeys/active` | Current active journey (Next.js, auth) |
| GET/PATCH | `/api/journeys/[id]` | Journey detail + live, or action transition (Next.js, auth) |
| POST | `/api/journeys/[id]/start` `/complete` `/cancel` | Lifecycle transitions (Next.js, auth) |
| GET | `/api/train/[id]` `/api/search` | Live train + search (Next.js server routes) |
| GET | `/api/weather` `/api/terrain` `/api/analytics/[id]` | Weather / terrain / analytics (Next.js server routes) |
| GET/POST | `/api/alerts` | List / create journey alerts (Next.js, auth) |
| PATCH/DELETE | `/api/alerts/[id]` | Toggle threshold / delete alert (Next.js, auth) |
| GET | `/api/notifications` | Notification history, cursor pagination (Next.js, auth) |
| POST | `/api/notifications/[id]/read` | Mark one notification read (Next.js, auth) |
| GET/POST | `/api/notifications/preferences` | Push device list / disable push (Next.js, auth) |
| POST/DELETE | `/api/notifications/push/subscribe` | Register / remove a web-push subscription (Next.js, auth) |

## MongoDB Collections

| Collection | Purpose | Written by |
|---|---|---|
| `users` | Accounts (email, bcrypt password) | NextAuth / `/api/register` |
| `sessions` | Login sessions | NextAuth `signIn` callback |
| `favorites` | Saved trains (userId-keyed) | Next.js `/api/favorites*` |
| `journeys` | Planned / active / completed / cancelled journeys | Next.js `/api/journeys*` |
| `recents` | Recent searches / journeys | backend `/api/v1/user/recent` |
| `alarms` | Proximity alarms | backend `/api/v1/alarms` |
| `train_snapshots` | Historical live observations (strictly real RailRadar data) | backend tracking worker |
| `alerts` | User alert rules (11 types, PUSH channel, per journey) | Next.js `/api/alerts*` |
| `notification_logs` | Notification history + delivery state (dedupeKey unique) | backend alert engine / worker |
| `push_subscriptions` | Web Push device subscriptions per user | Next.js `/api/notifications/push/subscribe` |

### Indexes (auto-created at startup)

| Collection | Index |
|---|---|
| `favorites` | `{ userId: 1, trainNumber: 1 }` (unique) |
| `journeys` | `{ userId: 1, status: 1 }`, `{ userId: 1, journeyDate: 1 }`, `{ userId: 1, createdAt: 1 }`, `{ status: 1, journeyDate: 1 }` |
| `train_snapshots` | `{ dedupKey: 1 }` (unique, sparse), `{ trainNumber: 1, journeyDate: 1, observedAt: 1 }`, `{ trainNumber: 1, journeyDate: 1 }`, `{ observedAt: 1 }`, `{ journeyDate: 1, status: 1 }` |
| `alerts` | `{ userId: 1, enabled: 1 }`, `{ journeyId: 1, enabled: 1 }`, `{ trainNumber: 1, enabled: 1 }`, `{ journeyId: 1, alertType: 1 }` |
| `notification_logs` | `{ dedupeKey: 1 }` (unique, sparse), `{ userId: 1, createdAt: -1 }`, `{ userId: 1, readAt: 1 }` |
| `push_subscriptions` | `{ userId: 1 }`, `{ endpoint: 1 }` (unique) |

## Features

- **Live Map** — MapLibre, animated train marker, route glow, follow camera
- **PNR Status** — passenger-wise CNF/RAC/WL, berth, coach, chart status, confirmation probability
- **Trains Between Stations** — route search with times, duration, run days, live delay
- **Station Live Board** — arrivals/departures, platforms, delays (2/4/6/8h windows)
- **Schedule & Coach Position** — full timetable + coach diagram (Engine → DL1)
- **Proximity Alarms** — "notify when train is X km from my station" (Web Push + background checker)
- **Favorites / Recent** - stored in MongoDB per user (cross-device sync)
- **Journey Tracking** - "Where is my train": pick train + boarding + destination (+ IST date), validated against the real route; start / complete / cancel with strict lifecycle; live status, delay, current station, ETA, route progress and live map while active
- **Live Snapshot Engine** - background worker polls every ACTIVE (and pre-start PLANNED) journey from the REAL RailRadar API, persists strictly real observations to `train_snapshots` (never estimated lat/lng/speed/delay), deduplicates via a unique key, auto-completes only on strong evidence, and reports honest health via `/api/v1/tracking/status`
- **Alert & Notification Engine** - per-journey alerts (11 types: delay threshold/increase/reduction, train started/departed/arrived, destination approaching, journey completed, cancelled, diverted, live-data stale) evaluated against REAL consecutive snapshots only; Redis-backed notification queue with exponential backoff, retry cap, and two-layer dedupe (Redis SETNX + MongoDB unique `dedupeKey`); Web Push delivery via VAPID; notification center + journey alerts UI (`/journeys/[id]`, `/notifications`)
- **Share** — public live journey link
- **PWA-ready** — manifest + service worker

## Testing

Each phase has a standalone HTTP test script that runs against a live stack.

Prereq: backend on :4000 and a production frontend build on :3000.

```bash
# Frontend production build (first time / after changes)
cd frontend && npm run build && npm start

# Backend
cd backend && npm start

# Then, in separate terminals:
node frontend/scripts/phase3-test.mjs    # accounts / favorites / journeys (26 tests)
cd backend && node scripts/phase4-test.mjs   # tracking worker e2e (real data)
cd backend && node scripts/phase5-test.mjs   # alerts + notifications (23 tests)
```

From the repo root, `npm run test:phase3`, `npm run test:phase4`, `npm run test:phase5` do the same.

## Production Notes

- RailRadar **free tier = 50 requests/day** (per their docs). Upgrade your plan or set Upstash Redis (`UPSTASH_REDIS_REST_URL/TOKEN`) — caching already wired in `backend/src/services/cache.js`.
- Alarms require `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` in `backend/.env` and HTTPS (or localhost) for push.
- **Tracking worker** runs automatically inside the backend (`node backend/src/server.js`) when `TRAIN_TRACKING_ENABLED=true`, or as its own process: `node backend/src/worker.js`. Tune interval/concurrency/target caps and snapshot retention via the `TRAIN_TRACKING_*` vars (see `backend/.env.example`). `INTERNAL_API_TOKEN` (optional) enables the one-shot internal tracking test endpoint; leave empty to keep it disabled.
- **Alert/notification engine** runs inside the same backend process when `ALERTS_ENABLED=true` (evaluates every freshly written real snapshot, delivers from the Redis `notify:due` queue every `NOTIFY_WORKER_INTERVAL_SECONDS`). Push delivery needs `VAPID_*` keys in `backend/.env`. Alert/notification APIs are Next.js routes behind NextAuth sessions; all `alerts`/`notification_logs`/`push_subscriptions` indexes are created automatically on startup (mongoose `syncIndexes` + Next.js `ensureIndexes`).
- **Secrets**: `backend/.env` holds all RailRadar / Redis / VAPID keys. The Next.js app keeps only what its own server routes need (`MONGODB_URI`, `NEXTAUTH_SECRET`, and optional weather/terrain keys) in `frontend/.env.local` — these are server-side only and never shipped to the browser. Browser-safe vars are `NEXT_PUBLIC_*` only.
- Mobile/desktop apps can reuse the same REST API — no changes needed.

## Roadmap

- [x] Live tracking + map + weather + terrain
- [x] PNR status
- [x] Trains between stations
- [x] Station live board
- [x] Coach position & full schedule
- [x] Proximity alarms (Web Push)
- [x] MongoDB persistence (favorites / recent / alarms)
- [x] Accounts + cross-device sync (NextAuth, email + password)
- [x] Favorites + journey tracking ("Where is my train" - live status, delay, ETA, map)
- [x] Live train snapshot engine + background worker (real RailRadar, dedup, retention, worker status)
- [x] Alert + notification engine (real-data events, Redis queue + retry + dedupe, Web Push, notification center)
- [x] Architecture restructure — separate `backend/` and `frontend/`
- [ ] Google OAuth / email verification
- [ ] Seat availability / fare enquiry
- [ ] Hindi (hi) locale
