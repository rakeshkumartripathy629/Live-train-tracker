import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId, backendApiUrl, apiError } from '@/lib/server';
import clientPromise from '@/lib/mongodb';
import { getOwnedJourney } from '@/lib/journeys';

// The SSE stream must run on the Node runtime (long-lived response) — never Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Phase 7 — same-origin SSE proxy to the backend live-train stream.
 *
 * The browser opens EventSource('/api/stream/journey/:id'), this route:
 *   1. authenticates the session (NextAuth) and verifies journey ownership,
 *   2. forwards the internal token + journey owner to the backend
 *      (/api/v1/stream/journey/:id) server-to-server,
 *   3. pipes the upstream event stream back, aborting upstream on client
 *      disconnect. The backend token never reaches the browser.
 */
export async function GET(req: NextRequest, { params }: { params: { journeyId: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');

  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken) return apiError('Live streaming is not enabled', 503, 'STREAM_NOT_ENABLED');

  const db = (await clientPromise).db();
  const journey = await getOwnedJourney(db, userId, params.journeyId);
  if (!journey) return apiError('Journey not found', 404, 'NOT_FOUND');

  const controller = new AbortController();
  const abortOnClientDisconnect = () => controller.abort();
  req.signal.addEventListener('abort', abortOnClientDisconnect, { once: true });

  const upstream = await fetch(`${backendApiUrl()}/stream/journey/${params.journeyId}`, {
    headers: {
      'X-Internal-Token': internalToken,
      'X-Journey-User': userId,
      'Last-Event-ID': req.headers.get('last-event-id') || '',
    },
    cache: 'no-store',
    signal: controller.signal,
  }).catch(() => null);

  if (!upstream) {
    req.signal.removeEventListener('abort', abortOnClientDisconnect);
    return apiError('Live stream unavailable', 502, 'LIVE_STREAM_UNAVAILABLE');
  }

  if (!upstream.ok || !upstream.body) {
    req.signal.removeEventListener('abort', abortOnClientDisconnect);
    let message = `Live stream failed (${upstream.status})`;
    try {
      const body = await upstream.json();
      if (body?.error) message = String(body.error);
    } catch {
      // non-JSON error body — keep the generic message
    }
    return apiError(message, upstream.status, 'LIVE_STREAM_UNAVAILABLE');
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
