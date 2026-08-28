import { type NextRequest } from 'next/server';
import { proxyTypeRivalApi } from '../../../../lib/supabase-api';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return proxyTypeRivalApi(request, '/account/export');
}
