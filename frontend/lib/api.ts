const DEFAULT_API_URL = 'http://localhost:4000/api/v1';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || DEFAULT_API_URL;

let cachedDeviceId: string | null = null;

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  if (cachedDeviceId) return cachedDeviceId;
  let id = localStorage.getItem('railgaadi-device-id');
  if (!id) {
    id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('railgaadi-device-id', id);
  }
  cachedDeviceId = id;
  return id;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PUT';
  body?: unknown;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;
  const res = await fetch(`${API_URL}${path}`, {
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
    throw new ApiError(
      json?.error || `Request failed (${res.status})`,
      res.status,
      json?.code
    );
  }
  return json.data as T;
}
