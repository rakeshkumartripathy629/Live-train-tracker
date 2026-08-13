/**
 * Phase 3 verification script — real HTTP calls against a running stack.
 *
 * Prereqs (run first):
 *   1. backend:  node src/server.js            (port 4000)
 *   2. frontend: npm run build && npm run start (port 3000)
 *
 * Usage:
 *   node scripts/phase3-test.mjs
 *
 * Exit code 0 = all passed, 1 = failures.
 */

const BASE = process.env.PHASE3_BASE || 'http://localhost:3000';
const BACKEND = process.env.PHASE3_BACKEND || 'http://localhost:4000/api/v1';

const suffix = Date.now().toString(36);
const USER_A = { name: 'User A', email: `phase3_a_${suffix}@railgaadi.dev`, password: 'test1234' };
const USER_B = { name: 'User B', email: `phase3_b_${suffix}@railgaadi.dev`, password: 'test1234' };

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
  } catch (err) {
    results.push({ name, pass: false, err: err?.message || String(err) });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function cookies(res) {
  const sc =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);
  return sc.map((c) => c.split(';')[0]).join('; ');
}

async function jsonFetch(path, { method = 'GET', cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  return { res, json };
}

async function register(user) {
  const { res } = await jsonFetch('/api/register', {
    method: 'POST',
    body: { name: user.name, email: user.email, password: user.password },
  });
  if (![200, 409].includes(res.status)) {
    throw new Error(`register failed (${res.status})`);
  }
}

async function login(user) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const jar = cookies(csrfRes);

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jar },
    body: JSON.stringify({ csrfToken, email: user.email, password: user.password }),
    redirect: 'manual',
  });
  const jar2 = cookies(res);
  assert(jar2.includes('session-token'), 'signin did not set session cookie');

  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: jar2 },
  });
  const session = await sessionRes.json();
  assert(session?.user?.id, 'session.user.id missing');
  return { cookie: jar2, userId: session.user.id };
}

function istToday() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

function istFuture(days) {
  const base = new Date(`${istToday()}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('── Setup: register + login A & B ──');
  await register(USER_A);
  await register(USER_B);
  const A = await login(USER_A);
  const B = await login(USER_B);
  console.log(`  A = ${A.userId}`);
  console.log(`  B = ${B.userId}`);
  console.log(`  journeyDate = ${istToday()}`);

  // 1. Unauthenticated access rejected
  await test('1. unauth cannot create favorite (401)', async () => {
    const { res } = await jsonFetch('/api/favorites', { method: 'POST', body: { trainNumber: '12951' } });
    assert(res.status === 401, `expected 401 got ${res.status}`);
  });

  await test('2. unauth cannot create journey (401)', async () => {
    const { res } = await jsonFetch('/api/journeys', {
      method: 'POST',
      body: { trainNumber: '12951', boardingStationCode: 'ST', destinationStationCode: 'BRC', journeyDate: istToday() },
    });
    assert(res.status === 401, `expected 401 got ${res.status}`);
  });

  await test('3. unauth cannot list favorites (401)', async () => {
    const { res } = await jsonFetch('/api/favorites');
    assert(res.status === 401, `expected 401 got ${res.status}`);
  });

  // 4. Favorite create + 5. duplicate prevention
  await test('4. A creates favorite 12951', async () => {
    const { res, json } = await jsonFetch('/api/favorites', { method: 'POST', body: { trainNumber: '12951' }, cookie: A.cookie });
    assert([200, 201].includes(res.status), `expected 2xx got ${res.status}`);
    assert(json?.data?.trainNumber === '12951', 'wrong trainNumber returned');
  });

  await test('5. duplicate favorite prevented (single doc)', async () => {
    await jsonFetch('/api/favorites', { method: 'POST', body: { trainNumber: '12951' }, cookie: A.cookie });
    const { json } = await jsonFetch('/api/favorites', { cookie: A.cookie });
    const favs = json.data.filter((f) => f.trainNumber === '12951');
    assert(favs.length === 1, `expected 1 favorite for 12951, got ${favs.length}`);
  });

  await test('6. favorite status endpoint (isFavorite=true)', async () => {
    const { json } = await jsonFetch('/api/favorites/12951', { cookie: A.cookie });
    assert(json?.data?.isFavorite === true, `expected true got ${json?.data?.isFavorite}`);
  });

  await test('7. B cannot see A favorites (isolation)', async () => {
    const { json } = await jsonFetch('/api/favorites', { cookie: B.cookie });
    assert(json.data.length === 0, `expected empty, got ${json.data.length}`);
  });

  await test('8. B cannot delete A favorite', async () => {
    const { res, json } = await jsonFetch('/api/favorites/12951', { method: 'DELETE', cookie: B.cookie });
    assert(res.status === 200 && json?.data?.deleted === false, `expected deleted:false got ${JSON.stringify(json?.data)}`);
    const { json: aList } = await jsonFetch('/api/favorites', { cookie: A.cookie });
    assert(aList.data.some((f) => f.trainNumber === '12951'), 'A lost favorite after B delete attempt');
  });

  await test('9. user cannot fake another userId (body userId ignored)', async () => {
    const { json } = await jsonFetch('/api/favorites', { method: 'POST', body: { trainNumber: '22436', userId: A.userId }, cookie: B.cookie });
    assert(json?.data?.trainNumber === '22436', 'favorite create failed');
    const { json: aList } = await jsonFetch('/api/favorites', { cookie: A.cookie });
    assert(!aList.data.some((f) => f.trainNumber === '22436'), 'fake userId leaked into A account');
    const { json: bList } = await jsonFetch('/api/favorites', { cookie: B.cookie });
    assert(bList.data.some((f) => f.trainNumber === '22436'), 'favorite should live under B');
  });

  // ── Journeys ──
  let journeyId = null;
  await test('10. A creates journey ST→BRC (201)', async () => {
    const { res, json } = await jsonFetch('/api/journeys', {
      method: 'POST',
      body: { trainNumber: '12951', boardingStationCode: 'ST', destinationStationCode: 'BRC', journeyDate: istToday() },
      cookie: A.cookie,
    });
    assert(res.status === 201, `expected 201 got ${res.status}: ${JSON.stringify(json)}`);
    assert(json?.data?.status === 'PLANNED', 'journey should start as PLANNED');
    assert(json?.data?.boardingStationName === 'SURAT', `expected SURAT got ${json?.data?.boardingStationName}`);
    journeyId = json.data.id;
  });

  await test('11. invalid boarding station rejected (400)', async () => {
    const { res, json } = await jsonFetch('/api/journeys', {
      method: 'POST',
      body: { trainNumber: '12951', boardingStationCode: 'ZZZ', destinationStationCode: 'BRC', journeyDate: istToday() },
      cookie: A.cookie,
    });
    assert(res.status === 400, `expected 400 got ${res.status}`);
    assert(json?.error?.code === 'INVALID_BOARDING_STATION', `wrong code: ${json?.error?.code}`);
  });

  await test('12. wrong station order rejected (400)', async () => {
    const { res, json } = await jsonFetch('/api/journeys', {
      method: 'POST',
      body: { trainNumber: '12951', boardingStationCode: 'BRC', destinationStationCode: 'ST', journeyDate: istToday() },
      cookie: A.cookie,
    });
    assert(res.status === 400, `expected 400 got ${res.status}`);
    assert(json?.error?.code === 'INVALID_STATION_ORDER', `wrong code: ${json?.error?.code}`);
  });

  await test('13. invalid train rejected (TRAIN_NOT_FOUND)', async () => {
    const { res, json } = await jsonFetch('/api/journeys', {
      method: 'POST',
      body: { trainNumber: '99999', boardingStationCode: 'ST', destinationStationCode: 'BRC', journeyDate: istToday() },
      cookie: A.cookie,
    });
    assert([404, 502].includes(res.status), `expected 4xx/5xx got ${res.status}`);
    assert(json?.error?.code === 'TRAIN_NOT_FOUND', `wrong code: ${json?.error?.code}`);
  });

  await test('14. duplicate active journey rejected (409)', async () => {
    const { res, json } = await jsonFetch('/api/journeys', {
      method: 'POST',
      body: { trainNumber: '12951', boardingStationCode: 'ST', destinationStationCode: 'BRC', journeyDate: istToday() },
      cookie: A.cookie,
    });
    assert(res.status === 409, `expected 409 got ${res.status}`);
    assert(json?.error?.code === 'DUPLICATE_JOURNEY', `wrong code: ${json?.error?.code}`);
  });

  await test('15. B cannot see A journeys (isolation)', async () => {
    const { json } = await jsonFetch('/api/journeys', { cookie: B.cookie });
    assert(json.data.length === 0, `expected empty got ${json.data.length}`);
  });

  await test('16. B cannot read A journey (404)', async () => {
    const { res } = await jsonFetch(`/api/journeys/${journeyId}`, { cookie: B.cookie });
    assert(res.status === 404, `expected 404 got ${res.status}`);
  });

  await test('17. B cannot update A journey (404)', async () => {
    const { res } = await jsonFetch(`/api/journeys/${journeyId}/start`, { method: 'POST', cookie: B.cookie });
    assert(res.status === 404, `expected 404 got ${res.status}`);
  });

  await test('18. active endpoint returns null before start', async () => {
    const { json } = await jsonFetch('/api/journeys/active', { cookie: A.cookie });
    assert(json.data === null, `expected null got ${JSON.stringify(json.data)}`);
  });

  await test('19. start journey (PLANNED→ACTIVE)', async () => {
    const { res, json } = await jsonFetch(`/api/journeys/${journeyId}/start`, { method: 'POST', cookie: A.cookie });
    assert(res.status === 200, `expected 200 got ${res.status}`);
    assert(json?.data?.status === 'ACTIVE', `expected ACTIVE got ${json?.data?.status}`);
    assert(Boolean(json?.data?.startedAt), 'startedAt should be set');
  });

  await test('20. active endpoint returns the journey', async () => {
    const { json } = await jsonFetch('/api/journeys/active', { cookie: A.cookie });
    assert(json?.data?.id === journeyId, 'active journey mismatch');
  });

  await test('21. single journey returns live (real RailRadar or clean unavailable)', async () => {
    const { json } = await jsonFetch(`/api/journeys/${journeyId}`, { cookie: A.cookie });
    assert(json?.data?.id === journeyId, 'journey id mismatch');
    assert(typeof json?.data?.live?.available === 'boolean', 'live.available missing');
    if (json.data.live.available) {
      assert(json.data.live.data?.number === '12951', 'live data should be real 12951');
      assert(typeof json.data.live.data?.currentStation !== 'undefined', 'currentStation missing');
    }
  });

  await test('22. complete journey (ACTIVE→COMPLETED)', async () => {
    const { res, json } = await jsonFetch(`/api/journeys/${journeyId}/complete`, { method: 'POST', cookie: A.cookie });
    assert(res.status === 200, `expected 200 got ${res.status}`);
    assert(json?.data?.status === 'COMPLETED', `expected COMPLETED got ${json?.data?.status}`);
    assert(Boolean(json?.data?.completedAt), 'completedAt should be set');
  });

  await test('23. status filter returns completed journey', async () => {
    const { json } = await jsonFetch('/api/journeys?status=COMPLETED', { cookie: A.cookie });
    assert(json.data.some((j) => j.id === journeyId), 'completed journey missing from filter');
  });

  await test('24. cancel keeps historical record (soft)', async () => {
    const { json: created } = await jsonFetch('/api/journeys', {
      method: 'POST',
      body: { trainNumber: '12951', boardingStationCode: 'RTM', destinationStationCode: 'KOTA', journeyDate: istFuture(2) },
      cookie: A.cookie,
    });
    const id2 = created.data.id;
    const { res, json } = await jsonFetch(`/api/journeys/${id2}/cancel`, { method: 'POST', cookie: A.cookie });
    assert(res.status === 200 && json?.data?.status === 'CANCELLED', 'cancel failed');
    const { json: cancelled } = await jsonFetch('/api/journeys?status=CANCELLED', { cookie: A.cookie });
    assert(cancelled.data.some((j) => j.id === id2), 'cancelled journey missing from list (must not hard-delete)');
  });

  await test('25. favorites live batch returns real data', async () => {
    const { res, json } = await jsonFetch('/api/favorites/live', {
      method: 'POST',
      body: { trainNumbers: ['12951'] },
      cookie: A.cookie,
    });
    assert(res.status === 200, `expected 200 got ${res.status}`);
    const entry = json.data['12951'];
    assert(entry, 'missing entry for 12951');
    if (entry.error) {
      assert(['UNAVAILABLE', 'TRAIN_NOT_FOUND'].includes(entry.error), `unexpected error ${entry.error}`);
    } else {
      assert(entry.number === '12951', 'live entry should be real train 12951');
    }
  });

  await test('26. unauth favorite status rejected (401)', async () => {
    const { res } = await jsonFetch('/api/favorites/12951');
    assert(res.status === 401, `expected 401 got ${res.status}`);
  });

  // ── Summary ──
  console.log('\n──── RESULTS ────');
  const passed = results.filter((r) => r.pass);
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : ` — ${r.err}`}`);
  }
  console.log(`\n${passed.length}/${results.length} passed`);
  process.exit(passed.length === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
