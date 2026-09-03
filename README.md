# TypeRival

TypeRival is a competitive typing web app built for touchscreens and physical keyboards. The MVP includes Practice, asynchronous Ranked head-to-head, Friendly challenge links, language-aware rolling 30-day leaderboards, XP, and temporary double-XP rewards. Players can choose English, Spanish, French, German, Portuguese, or Italian passage libraries; English remains the default.

## Production architecture

- **Web app:** Next.js App Router on Vercel
- **Accounts:** Supabase Auth with Google and email/password
- **Game API:** Supabase Edge Function behind same-origin Next.js route handlers
- **Data:** Supabase PostgreSQL with RLS, service-only tables, database aggregation, and atomic match functions
- **Realtime:** Not required for the current asynchronous modes. See [docs/colyseus-evaluation.md](docs/colyseus-evaluation.md).

The browser never receives a Supabase service-role key. Saved runs require a request-scoped authenticated user, a server-issued run ticket, a server-started clock, and a one-use submission.

## Local development

Requirements:

- Node.js 24
- pnpm 11

Create `.env` from `.env.example` and add the public Supabase project URL and publishable key.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit
```

`pnpm verify` runs the first four checks in sequence. GitHub Actions runs the same release gate on every push and pull request.

## Database and Edge Function

Committed database migrations live in `supabase/migrations`. The Edge Function source is `supabase/functions/typerival-api/index.ts`.

Apply database migrations before deploying an Edge Function version that depends on them. After every production release, verify:

1. Public bootstrap loads.
2. Google and email authentication work.
3. A signed-in run can be authorized, started, submitted, and displayed.
4. Account export, handle update, and deletion work.
5. Vercel and Supabase logs contain no unexpected errors.

See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for platform configuration.

## Competition policy

The MVP is free-to-play. XP has no cash value, and no cash prize event is active. Prize features must remain disabled until official rules, eligibility and jurisdiction controls, identity checks, tax handling, anti-cheat review, and qualified legal review are complete.
