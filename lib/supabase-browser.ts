import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

let publicConfig: SupabasePublicConfig | null = null;
let browserClient: SupabaseClient | null | undefined;

export function configureSupabase(config: SupabasePublicConfig | null) {
  const changed = config?.url !== publicConfig?.url || config?.publishableKey !== publicConfig?.publishableKey;
  publicConfig = config;
  if (changed) browserClient = undefined;
}

export function isSupabaseConfigured() {
  return Boolean(publicConfig?.url && publicConfig.publishableKey);
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  const url = publicConfig?.url;
  const key = publicConfig?.publishableKey;
  browserClient = url && key
    ? createClient(url, key, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      })
    : null;
  return browserClient;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const client = getSupabaseBrowserClient();
  const headers = new Headers(init.headers);
  if (client) {
    const { data } = await client.auth.getSession();
    if (data.session?.access_token) headers.set('authorization', `Bearer ${data.session.access_token}`);
  }
  return fetch(input, { ...init, headers });
}
