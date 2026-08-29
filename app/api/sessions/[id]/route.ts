import { type NextRequest } from 'next/server';
import { proxyTypeRivalApi } from '../../../../lib/supabase-api';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;
  return proxyTypeRivalApi(request, `sessions/${encodeURIComponent(id)}`);
}
