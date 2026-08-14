import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId, backendApiUrl, apiError } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Phase 10 — same-origin proxy for the backend AI assistant chat.
 *
 * The browser posts /api/ai/chat; this route authenticates the NextAuth
 * session, then forwards to the backend /ai/chat with the user's id in
 * x-user-id and the shared internal token in x-internal-token (server-to-server
 * only — the token never reaches the browser). The SSE stream is piped
 * straight back so the assistant can stream tokens live.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken) return apiError('AI assistant is not enabled', 503, 'AI_NOT_CONFIGURED');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON body', 400, 'INVALID_BODY');
  }
  if (!body?.message || typeof body.message !== 'string' || !body.message.trim()) {
    return apiError('message is required', 400, 'INVALID_MESSAGE');
  }

  const controller = new AbortController();
  const abortOnClientDisconnect = () => controller.abort();
  req.signal.addEventListener('abort', abortOnClientDisconnect, { once: true });

  const upstream = await fetch(`${backendApiUrl()}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': internalToken,
      'X-User-Id': userId,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      conversationId: typeof body.conversationId === 'string' ? body.conversationId : '',
      message: body.message,
    }),
    cache: 'no-store',
    signal: controller.signal,
  }).catch(() => null);

  if (!upstream) {
    req.signal.removeEventListener('abort', abortOnClientDisconnect);
    return apiError('AI assistant is unavailable right now', 502, 'AI_UNAVAILABLE');
  }

  // Non-200 or non-stream responses are JSON errors — surface them cleanly.
  if (!upstream.ok || !upstream.body) {
    req.signal.removeEventListener('abort', abortOnClientDisconnect);
    let message = `AI assistant request failed (${upstream.status})`;
    let code = 'AI_ERROR';
    try {
      const j = await upstream.json();
      if (j?.error) message = String(j.error);
      if (j?.code) code = String(j.code);
    } catch {
      // non-JSON body
    }
    const status = upstream.status === 429 ? 429 : upstream.status || 502;
    const headers: Record<string, string> = {};
    const retry = upstream.headers.get('retry-after');
    if (retry) headers['Retry-After'] = retry;
    return NextResponse.json(
      { success: false, error: { code, message } },
      { status, headers }
    );
  }

  const reader = upstream.body.getReader();

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch {
        controller.error(new Error('stream interrupted'));
      }
    },
    cancel() {
      controller.abort();
      reader.cancel().catch(() => {});
      req.signal.removeEventListener('abort', abortOnClientDisconnect);
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
