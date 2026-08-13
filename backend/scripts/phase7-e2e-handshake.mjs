const NEXT = 'http://localhost:3000';
const suffix = Date.now().toString(36);
const user = { name: 'Phase7E2E', email: `p7e2e_${suffix}@railgaadi.dev`, password: 'test1234' };

const cookies = (res) =>
  (typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean))
    .map((c) => c.split(';')[0])
    .join('; ');

(async () => {
  let jar = '';

  const reg = await fetch(`${NEXT}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  console.log('register:', reg.status);

  const csrfRes = await fetch(`${NEXT}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  jar = cookies(csrfRes);
  const loginRes = await fetch(`${NEXT}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jar },
    body: JSON.stringify({ csrfToken, email: user.email, password: user.password }),
    redirect: 'manual',
  });
  jar = cookies(loginRes);
  console.log('login:', loginRes.status, 'hasSession:', jar.includes('session-token'));

  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const create = await fetch(`${NEXT}/api/journeys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jar },
    body: JSON.stringify({
      trainNumber: '68412',
      boardingStationCode: 'BAM',
      destinationStationCode: 'BBS',
      journeyDate: today,
    }),
  });
  const created = await create.json();
  console.log('create journey:', create.status, created.success, created.data?.id);
  if (!created.success) {
    console.log(JSON.stringify(created));
    process.exit(1);
  }
  const journeyId = created.data.id;

  const start = await fetch(`${NEXT}/api/journeys/${journeyId}/start`, {
    method: 'POST',
    headers: { Cookie: jar },
  });
  console.log('start journey:', start.status);

  const streamRes = await fetch(`${NEXT}/api/stream/journey/${journeyId}`, {
    headers: { Cookie: jar },
  });
  console.log('stream proxy open:', streamRes.status, streamRes.headers.get('content-type'));

  if (!streamRes.ok || !streamRes.body) {
    const txt = await streamRes.text();
    console.log('stream error body:', txt.slice(0, 300));
    process.exit(1);
  }

  const reader = streamRes.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let frames = 0;
  const deadline = Date.now() + 12000;
  const timer = setTimeout(() => reader.cancel().catch(() => {}), 12000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';
      for (const part of parts) {
        const ev = (part.match(/^event: (.+)$/m) || [])[1] || 'message';
        const d = (part.match(/^data: (.+)$/m) || [])[1];
        if (d) {
          frames += 1;
          console.log(`[${ev}]`, d.slice(0, 200));
        }
      }
      if (Date.now() > deadline) break;
    }
  } catch {
    // timeout
  }
  clearTimeout(timer);
  console.log('total frames:', frames);

  // cleanup
  await fetch(`${NEXT}/api/journeys/${journeyId}/cancel`, { method: 'POST', headers: { Cookie: jar } }).catch(() => {});
  console.log('cleaned up');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
