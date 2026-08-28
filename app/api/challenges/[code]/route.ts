import { type NextRequest } from 'next/server';
import { proxyTypeRivalApi } from '../../../../lib/supabase-api';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ code: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { code } = await context.params;
  return proxyTypeRivalApi(request, `challenges/${encodeURIComponent(code)}`);
}

export async function POST(request: NextRequest, context: Context) {
  const { code } = await context.params;
  return proxyTypeRivalApi(request, `challenges/${encodeURIComponent(code)}`);
}
