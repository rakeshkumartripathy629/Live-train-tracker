# RailGaadi — Frontend

Next.js 14 App Router frontend for RailGaadi.

- UI: live map, PNR, trains between stations, station boards, coach position, schedules, alarms, favorites, journeys, alerts, notifications.
- Talks to the backend at `http://localhost:4000/api/v1` via `NEXT_PUBLIC_API_URL`.
- NextAuth (email + password) and the authenticated Next.js API routes (`/api/favorites*`, `/api/journeys*`, `/api/alerts*`, `/api/notifications*`, `/api/register`) live here.
- Server-only route helpers live under `lib/` (used only by Next.js server routes, never shipped to the browser).

## Run

```bash
npm install
copy .env.example .env.local  # set NEXT_PUBLIC_API_URL, NEXTAUTH_SECRET, MONGODB_URI
npm run dev                   # http://localhost:3000
npm run build && npm start    # production
```

## Tests

```bash
node scripts/phase3-test.mjs  # accounts / favorites / journeys (needs backend on :4000)
```

See the root `README.md` for the full project setup.
