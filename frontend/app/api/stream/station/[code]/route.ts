import { NextRequest, NextResponse } from 'next/server';
import { backendApiUrl, apiError } from '@/lib/server';

// The SSE stream must run on the Node runtime (long-lived response) — never Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Phase 8 — same-origin SSE proxy to the backend station live stream.
 *
 * Station board data is public, but the backend stream is token-protected so it
 * can only be consumed by this proxy. The browser opens
 * EventSource('/api/stream/station/:code') and this route forwards the shared
 * internal token server-to-server — the token never reaches the browser.
 */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = String(params.code || '').trim().toUpperCase();
  if (!code || !/^[A-Z0-9]{2,5}$/.test(code)) {
    return apiError('Invalid station code', 400, 'INVALID_STATION_CODE');
  }

  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken) return apiError('Live streaming is not enabled', 503, 'STREAM_NOT_ENABLED');

  const controller = new AbortController();
  const abortOnClientDisconnect = () => controller.abort();
  req.signal.addEventListener('abort', abortOnClientDisconnect, { once: true });

  const upstream = await fetch(`${backendApiUrl()}/stream/station/${code}`, {
    headers: {
      'X-Internal-Token': internalToken,
      'Last-Event-ID': req.headers.get('last-event-id') || '',
    },
    cache: 'no-store',
    signal: controller.signal,
  }).catch(() => null);

  if (!upstream) {
    req.signal.removeEventListener('abort', abortOnClientDisconnect);
    return apiError('Live station stream unavailable', 502, 'LIVE_STREAM_UNAVAILABLE');
  }

  if (!upstream.ok || !upstream.body) {
    req.signal.removeEventListener('abort', abortOnClientDisconnect);
    let message = `Live station stream failed (${upstream.status})`;
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
