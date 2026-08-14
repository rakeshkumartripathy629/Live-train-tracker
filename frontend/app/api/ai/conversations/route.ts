import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId, backendApiUrl, apiError } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Phase 10 — list the signed-in user's AI conversations.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken) return apiError('AI assistant is not enabled', 503, 'AI_NOT_CONFIGURED');

  const res = await fetch(`${backendApiUrl()}/ai/conversations`, {
    headers: {
      'X-Internal-Token': internalToken,
      'X-User-Id': userId,
    },
    cache: 'no-store',
  }).catch(() => null);

  if (!res || !res.ok) {
    return apiError('Could not load conversations', res?.status === 401 ? 401 : 502, 'AI_UNAVAILABLE');
  }
  const json = await res.json().catch(() => null);
  if (!json?.success) {
    return apiError('Could not load conversations', 502, 'AI_UNAVAILABLE');
  }
  return NextResponse.json({ success: true, data: json.data });
}
