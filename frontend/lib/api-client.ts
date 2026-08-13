export class ApiClientError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface ClientRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/**
 * Same-origin client for the authenticated Next.js API routes
 * (/api/favorites, /api/journeys ...). Credentials/cookies are sent
 * automatically by the browser.
 */
export async function apiClient<T>(path: string, options: ClientRequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // empty body
  }

  if (!res.ok || !json?.success) {
    throw new ApiClientError(
      json?.error?.message || json?.error || `Request failed (${res.status})`,
      res.status,
      json?.error?.code
    );
  }
  return json.data as T;
}
