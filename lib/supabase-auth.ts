import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

export type AppUser = {
  userId: string;
  displayName: string;
  email: string;
};

export async function getSupabaseUser(request: NextRequest): Promise<AppUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = bearerToken(request.headers.get('authorization'));
  if (!url || !key || !token) return null;

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.email) return null;

  const metadata = data.user.user_metadata as Record<string, unknown>;
  const displayName = firstString(metadata.full_name, metadata.name, metadata.display_name) ?? data.user.email;
  return { userId: data.user.id, email: data.user.email, displayName };
}

function bearerToken(value: string | null) {
  if (!value?.startsWith('Bearer ')) return null;
  const token = value.slice(7).trim();
  return token.length > 20 ? token : null;
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}
