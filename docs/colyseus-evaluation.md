# Colyseus evaluation for TypeRival

Updated September 8, 2026.

## Decision

Keep Colyseus for live play without replacing the asynchronous MVP backend.

The first server-authoritative Colyseus mode now ships in the codebase as **Private Race (alpha)**. It provides synchronized countdowns, live opponent progress, server-validated typing, protected identity data, and a mobile reconnection window. Practice, Ranked Time Trial, and Challenge Link remain request/response workflows; moving those modes into persistent rooms would add cost and operational risk without improving them.

## Where Colyseus would help

- A server-authoritative 45-second Live Ranked room
- Private Race rooms with invite IDs
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

Rollout status and recommendation:

1. Keep Next.js/Vercel and Supabase as the system of record.
2. Continue testing the Private Race alpha as a separate Colyseus 0.18 service. **Implemented.**
3. Validate Supabase JWTs before admitting a player to a room. **Implemented.**
4. Keep alpha results session-only until abuse controls and result verification are production-ready. **Implemented.**
5. Add durable finalized-result persistence and idempotency before XP or ratings are awarded.
6. Add Redis Presence before running multiple Colyseus processes.
7. Load-test mobile reconnection, duplicate input, clock drift, disconnect forfeits, and room recovery.
8. Add rating-based queues and promote Colyseus to Live Ranked only after production soak testing passes.

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
