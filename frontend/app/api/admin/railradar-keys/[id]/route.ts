import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId, backendApiUrl, apiError } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getSessionUserId();
  if (!userId) return apiError('Authentication required', 401, 'UNAUTHORIZED');
  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken) return apiError('Admin API not enabled', 503, 'NOT_CONFIGURED');

  const upstream = await fetch(
    `${backendApiUrl()}/admin/railradar-keys/${params.id}`,
    {
      method: 'DELETE',
      headers: { 'X-Internal-Token': internalToken },
      cache: 'no-store',
    }
  ).catch(() => null);
  if (!upstream) return apiError('Admin API unavailable', 502, 'ADMIN_UNAVAILABLE');

  const body = await upstream.json().catch(() => null);
  return NextResponse.json(body ?? { success: false, error: 'Invalid response' }, {
    status: upstream.status,
  });
}
