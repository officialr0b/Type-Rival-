import { type NextRequest } from 'next/server';
import { proxyTypeRivalApi } from '../../../lib/supabase-api';

export const dynamic = 'force-dynamic';

export function POST(request: NextRequest) {
  return proxyTypeRivalApi(request, 'sessions');
}
