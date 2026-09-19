# TypeRival

TypeRival is a competitive typing web app built for touchscreens, physical keyboards, and translated stenography-writer output. The MVP includes Practice, TypeRival Academy, asynchronous Ranked Time Trials, asynchronous Challenge Links, live Private Races powered by Colyseus, language-aware rolling 30-day leaderboards, a ten-level Rival Career, daily and weekly missions, temporary double-XP rewards, Passage Studio, and persistent light/dark themes. Players can choose US English, UK English, Spanish, French, German, Portuguese, or Italian passage libraries; US English remains the default.

Passage Studio adds reviewed English learning passages across ten subjects, private device-only passages, custom friend challenges, and a moderated public-submission workflow. Custom-passage results are unverified and deliberately excluded from XP, boosts, verified averages, public leaderboards, and Ranked rating. Curated learning passages use the normal verified Practice and competition rules.

TypeRival Academy has two 18-stage tracks. Touch Typing provides six guided lessons, live key and finger cues, form checklists, adaptive repetition, rhythm review, and device-only progress. Stenography provides six theory-neutral lessons covering writer/Plover/CAT setup, keyboard anatomy, realtime theory, dictionaries and briefs, professional material, and accuracy-first speedbuilding. It grades translated text rather than raw strokes and supplements—but does not replace—formal instruction or certification. The Three.js coach stage lazy-loads Miles only inside Academy and falls back cleanly when the 3D asset or WebGL is unavailable. See [docs/miles-vrm-audit.md](docs/miles-vrm-audit.md) and [public/academy/README.md](public/academy/README.md) before changing or deploying the coach asset.

## Production architecture

- **Web app:** Next.js App Router on Vercel
- **Accounts:** Supabase Auth with Google and email/password
- **Game API:** Supabase Edge Function behind same-origin Next.js route handlers
- **Data:** Supabase PostgreSQL with RLS, service-only tables, database aggregation, and atomic match functions
- **Realtime:** Colyseus powers invite-only Private Races with server-authoritative input, timing, scoring, disconnect recovery, and forfeit handling. Ranked Time Trials and Challenge Links remain asynchronous. See [docs/colyseus-evaluation.md](docs/colyseus-evaluation.md).

The browser never receives a Supabase service-role key. Saved runs require a request-scoped authenticated user, a server-issued run ticket, a server-started clock, and a one-use submission.

## Rival Career

Verified runs award permanent lifetime XP and move signed-in players through ten named checkpoints: Rookie, Starter, Builder, Strider, Challenger, Contender, Pace Setter, Precision, Front Runner, and Elite Rival. Daily missions reset at 00:00 UTC and weekly missions reset Monday at 00:00 UTC. Mission bonuses are server-computed and claimed atomically once per player and period; they are not multiplied by a double-XP boost. Guest, under-13, custom-passage, and held-for-review runs do not advance online missions.

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
6. Passage submissions stay pending until reviewed, and custom challenge attempts award no XP or rating.
7. Mission progress reflects only verified eligible runs and completed mission XP cannot be claimed twice.

See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for platform configuration.

## Competition policy

The MVP is free-to-play. XP has no cash value, and no cash prize event is active. Prize features must remain disabled until official rules, eligibility and jurisdiction controls, identity checks, tax handling, anti-cheat review, and qualified legal review are complete.
