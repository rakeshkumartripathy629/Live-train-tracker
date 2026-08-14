import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId, backendApiUrl, apiError } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Phase 10 — GET full history of one AI conversation, or DELETE it.
 * Ownership is enforced server-side (backend scopes by the session userId).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken) return apiError('AI assistant is not enabled', 503, 'AI_NOT_CONFIGURED');

  const res = await fetch(`${backendApiUrl()}/ai/conversations/${params.id}`, {
    headers: {
      'X-Internal-Token': internalToken,
      'X-User-Id': userId,
    },
    cache: 'no-store',
  }).catch(() => null);

  if (!res) return apiError('Could not load conversation', 502, 'AI_UNAVAILABLE');
  if (res.status === 404) return apiError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
  if (!res.ok) return apiError('Could not load conversation', 502, 'AI_UNAVAILABLE');

  const json = await res.json().catch(() => null);
  if (!json?.success) return apiError('Could not load conversation', 502, 'AI_UNAVAILABLE');
  return NextResponse.json({ success: true, data: json.data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken) return apiError('AI assistant is not enabled', 503, 'AI_NOT_CONFIGURED');

  const res = await fetch(`${backendApiUrl()}/ai/conversations/${params.id}`, {
    method: 'DELETE',
    headers: {
      'X-Internal-Token': internalToken,
      'X-User-Id': userId,
    },
    cache: 'no-store',
  }).catch(() => null);

  if (!res) return apiError('Could not delete conversation', 502, 'AI_UNAVAILABLE');
  if (res.status === 404) return apiError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
  if (!res.ok) return apiError('Could not delete conversation', 502, 'AI_UNAVAILABLE');

  return NextResponse.json({ success: true, data: { deleted: true } });
}
