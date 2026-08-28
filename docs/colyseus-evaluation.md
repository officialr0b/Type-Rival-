# Colyseus evaluation for TypeRival

Updated August 28, 2026.

## Decision

Do not replace the current asynchronous MVP backend with Colyseus yet.

Colyseus is a strong fit for a future **live two-player mode** with synchronized countdowns, live opponent progress, room-level server authority, reconnect support, spectators, and rating-based queues. The existing Practice, banked Ranked runs, and shareable Friendly links are request/response workflows; moving them to persistent rooms now would add cost and operational risk without improving the launch-critical experience.

## Where Colyseus would help

- A server-authoritative 45-second Live Ranked room
- Live Friendly rooms with invite IDs
- A built-in Queue Room with rating compatibility and waiting-priority rules
- Lobby and room-browser experiences
- Automatic room-state synchronization with property-level patches
- Automatic reconnection after temporary mobile network drops
- Per-client message-rate limits and room lifecycle controls
- Spectator rooms and live tournament brackets
- Supabase JWT validation in a room's static `onAuth`
- React hooks through `@colyseus/react`
- Redis Presence and Redis Driver for multi-process deployments
- Load testing, testing helpers, Monitor, Playground, and a production Admin package

Colyseus 0.18 also adds input buffering, fixed-timestep server simulation, client prediction, and lag compensation. Those are substantial additions for action games; TypeRival would mainly use the input channel, synchronized clock, acknowledgements, and authoritative room state rather than physics prediction.

## Newer capabilities worth tracking

- **Queue Room:** rank-based grouping, custom compatibility, team grouping, priority escalation, incomplete groups, and custom room creation.
- **React integration:** `useRoom`, `useRoomState`, `useLobbyRoom`, and `useQueueRoom`.
- **0.18 database/admin packages:** optional Drizzle-backed persistence, cloud saves, leaderboards, analytics, audit logs, user administration, bans, session revocation, RBAC, and a live room inspector.
- **0.18 netcode:** typed input buffering, fixed timesteps, prediction/reconciliation, rewind state, and lag compensation.
- **Request/response messages:** server handlers can reply to client calls without building a separate REST endpoint.
- **Serverless adapter:** recent Colyseus releases added `Server.serverless()`, including a Vercel-oriented exported-server path.

## Hosting recommendation

Vercel added native WebSocket support in public beta in June 2026. Connections remain pinned to a Function for its maximum duration, and durable state across instances requires Redis. A 45-second match can fit technically, but queue time, reconnect windows, deployment limits, beta behavior, and serious-esport reliability make a separate always-on Colyseus service the safer long-term design.

Recommended rollout:

1. Keep Next.js/Vercel and Supabase as the system of record.
2. Build a small Live Friendly proof of concept as a separate Colyseus 0.18 service.
3. Validate Supabase JWTs in `static onAuth`.
4. Persist only finalized results to the existing Supabase schema.
5. Add Redis Presence before running multiple Colyseus processes.
6. Load-test mobile reconnection, duplicate input, clock drift, and room recovery.
7. Promote the service to Live Ranked only after the asynchronous MVP is stable.

## Sources

- [Colyseus rooms and built-in room types](https://docs.colyseus.io/room)
- [Queue Room](https://docs.colyseus.io/matchmaker/queue)
- [State synchronization](https://docs.colyseus.io/state)
- [Automatic reconnection](https://docs.colyseus.io/room/reconnection)
- [React SDK](https://docs.colyseus.io/getting-started/react)
- [Colyseus 0.18 migration and new packages](https://docs.colyseus.io/migrating/0.18)
- [Room authentication](https://docs.colyseus.io/auth/room)
- [Presence and Redis](https://docs.colyseus.io/server/presence)
- [Vercel WebSocket public beta](https://vercel.com/changelog/websocket-support-is-now-in-public-beta)
