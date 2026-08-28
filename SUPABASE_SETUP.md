# TypeRival Supabase setup

TypeRival uses Supabase for authentication, PostgreSQL data, and its protected game API.

## Public web configuration

Copy the project URL and publishable key from Supabase into local `.env` and the Vercel Production, Preview, and Development environments:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=https://type-rival-five.vercel.app
```

Only these public values belong in the Next.js project. Never add the Supabase service-role key or Google OAuth secret to source control or a `NEXT_PUBLIC_` variable.

## Authentication

In Supabase Authentication:

1. Enable email/password and Google.
2. Keep email confirmation enabled.
3. Set the Site URL to `https://type-rival-five.vercel.app`.
4. Allow `https://type-rival-five.vercel.app/**` and the approved local development callback.
5. Enable leaked-password protection.
6. Keep anonymous sign-in disabled.

The Google OAuth client must authorize the Supabase callback:

```text
https://fkjtqexdudaliuawwrqy.supabase.co/auth/v1/callback
```

## Database security

- Every public game table has RLS enabled.
- `anon` and `authenticated` have no direct table access.
- Only the Edge Function's service role can execute game RPCs.
- Security-definer functions revoke execution from `PUBLIC`, `anon`, and `authenticated`.
- New migrations explicitly grant only the service-role access required by the API.

Run the Supabase security and performance advisors after every migration. “RLS enabled with no policy” is intentional for service-only game tables.

## Release order

1. Apply new files from `supabase/migrations`.
2. Verify the migration and advisors.
3. Deploy `supabase/functions/typerival-api` with custom authentication enabled in the function body.
4. Deploy the matching Next.js version.
5. Verify bootstrap, authentication, authorized run submission, leaderboard refresh, account export, and deletion.

The function's platform JWT check remains disabled because public bootstrap and guest challenge reads share the same function. Authenticated mutations validate the bearer token inside a request-scoped Supabase client.
