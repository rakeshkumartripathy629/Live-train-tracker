# RailGaadi — Backend

Node + Express + MongoDB + Redis backend for RailGaadi.

- Serves the REST API on `http://localhost:4000/api/v1` (trains, stations, PNR, alarms, tracking, user).
- Holds all API keys server-side (`RAILRADAR_API_KEY`, Redis, VAPID).
- Runs the live train snapshot worker (real RailRadar data) and the alert/notification worker.

## Run

```bash
npm install
copy .env.example .env        # Windows
npm run dev                   # nodemon, http://localhost:4000
npm start                     # node src/server.js
```

Standalone tracking worker: `node src/worker.js` (also runs inside `server.js` when `TRAIN_TRACKING_ENABLED=true`).

## Tests

```bash
node scripts/phase4-test.mjs  # tracking worker e2e (real data, needs PHASE4_INTERNAL_TOKEN in .env)
node scripts/phase5-test.mjs  # alert + notification engine (23 tests)
```

See the root `README.md` for the full project setup.
