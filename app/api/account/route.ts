import { type NextRequest } from 'next/server';
import { proxyTypeRivalApi } from '../../../lib/supabase-api';

export const dynamic = 'force-dynamic';

export function PATCH(request: NextRequest) {
  return proxyTypeRivalApi(request, '/account');
}

export function DELETE(request: NextRequest) {
  return proxyTypeRivalApi(request, '/account');
}
