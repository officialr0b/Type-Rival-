# TypeRival Supabase setup

TypeRival uses Supabase only for player identity. Race results, XP, ratings, challenges, and leaderboards remain in the app's D1 database.

## 1. Create the project

Create a Supabase project, then copy these two public values from **Project Settings → API**:

- Project URL
- Publishable key

TypeRival expects them as:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Never add the Supabase service-role key or a Google client secret to the TypeRival source code.

## 2. Configure email accounts

In **Authentication → Providers → Email**, enable email/password sign-in. Keep email confirmation enabled for the public MVP.

In **Authentication → URL Configuration**, set:

- Site URL: `https://typerival.robert-perez2132.chatgpt.site`
- Redirect URL: `https://typerival.robert-perez2132.chatgpt.site/**`

## 3. Configure Google

Create a Google OAuth web client, then add this Supabase callback as an authorized redirect URI:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

Add the Google client ID and secret only in **Supabase → Authentication → Providers → Google**. Do not put them in TypeRival.

## 4. Activate the Vercel app

Add the project URL and publishable key to the TypeRival Vercel project's production and preview environments, then deploy. Add the final Vercel production URL to Supabase's allowed redirect URLs so Supabase owns player sign-in.
