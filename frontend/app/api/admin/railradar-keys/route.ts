import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId, backendApiUrl, apiError } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Phase 10.1 — same-origin proxy for the RailRadar key admin API.
 * Authenticates the NextAuth session, then forwards to the backend
 * /admin/railradar-keys with the internal token (never sent to the browser).
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');
  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken) return apiError('Admin API not enabled', 503, 'NOT_CONFIGURED');

  const upstream = await fetch(`${backendApiUrl()}/admin/railradar-keys`, {
    headers: { 'X-Internal-Token': internalToken },
    cache: 'no-store',
  }).catch(() => null);
  if (!upstream) return apiError('Admin API unavailable', 502, 'ADMIN_UNAVAILABLE');

  const body = await upstream.json().catch(() => null);
  return NextResponse.json(body ?? { success: false, error: 'Invalid response' }, {
    status: upstream.status,
  });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');
  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken) return apiError('Admin API not enabled', 503, 'NOT_CONFIGURED');

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return apiError('Invalid JSON body', 400, 'INVALID_BODY');
  }
  if (!payload?.key || typeof payload.key !== 'string') {
    return apiError('key is required', 400, 'KEY_REQUIRED');
  }

  const upstream = await fetch(
    `${backendApiUrl()}/admin/railradar-keys?test=1`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': internalToken,
        'X-User-Id': userId,
      },
      body: JSON.stringify({
        key: payload.key,
        label: typeof payload.label === 'string' ? payload.label : '',
      }),
      cache: 'no-store',
    }
  ).catch(() => null);
  if (!upstream) return apiError('Admin API unavailable', 502, 'ADMIN_UNAVAILABLE');

  const body = await upstream.json().catch(() => null);
  return NextResponse.json(body ?? { success: false, error: 'Invalid response' }, {
    status: upstream.status,
  });
}
