import { createClient, type User } from 'npm:@supabase/supabase-js@2.112.4';
import { calculateMetrics, decideWinner, getPassage, xpForMode, type GameMode } from '../../../lib/game.ts';
import { updateGlicko2 } from '../../../lib/glicko2.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const DOUBLE_XP_MS = 30 * 60 * 1_000;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

type PlayerRow = {
  id: string;
  handle: string;
  xp: number;
  rating: number;
  deviation: number;
  volatility: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  double_xp_until: string | null;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const url = new URL(request.url);
    const route = routeParts(url.pathname);
    const user = await authenticatedUser(request);

    if (request.method === 'GET' && route[0] === 'bootstrap') {
      return json(await bootstrap(url, user));
    }
    if (request.method === 'POST' && route[0] === 'sessions') {
      return await submitSession(request, user);
    }
    if (route[0] === 'challenges' && route[1]) {
      return request.method === 'GET'
        ? await loadChallenge(route[1])
        : request.method === 'POST'
          ? await attemptChallenge(request, route[1], user)
          : json({ error: 'Method not allowed.' }, 405);
    }
    if (request.method === 'POST' && route[0] === 'challenges') {
      return await createChallenge(request, user);
    }
    return json({ error: 'TypeRival endpoint not found.' }, 404);
  } catch (error) {
    console.error('typerival_api_failed', error);
    return json({ error: 'TypeRival could not complete that request.' }, 500);
  }
});

function routeParts(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  const functionIndex = parts.lastIndexOf('typerival-api');
  return functionIndex >= 0 ? parts.slice(functionIndex + 1) : parts;
}

async function authenticatedUser(request: Request) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (token.length < 20) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user;
}

async function ensurePlayer(user: User): Promise<PlayerRow> {
  const existing = await db.from('players').select('*').eq('id', user.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as PlayerRow;

  const metadata = user.user_metadata as Record<string, unknown>;
  const displayName = firstString(metadata.full_name, metadata.name, metadata.display_name) ?? user.email ?? 'Rival';
  const safeBase = displayName.split('@')[0]?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'Rival';
  const suffix = user.id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
  const inserted = await db.from('players').upsert({ id: user.id, handle: `${safeBase}${suffix}` }, { onConflict: 'id' }).select('*').single();
  if (inserted.error) throw inserted.error;
  return inserted.data as PlayerRow;
}

async function bootstrap(url: URL, user: User | null) {
  const eligible = ['teen', 'adult'].includes(url.searchParams.get('ageBand') ?? '');
  const player = user && eligible ? await ensurePlayer(user) : null;
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();

  const boardQuery = await db.from('sessions')
    .select('user_id, net_wpm, accuracy, players!inner(handle, rating)')
    .eq('risk_status', 'clear').gte('created_at', cutoff).limit(10_000);
  if (boardQuery.error) throw boardQuery.error;
  const board = new Map<string, { handle: string; rating: number; wpm: number; accuracy: number; sessions: number }>();
  for (const raw of boardQuery.data ?? []) {
    const row = raw as unknown as { user_id: string; net_wpm: number; accuracy: number; players: { handle: string; rating: number } | Array<{ handle: string; rating: number }> };
    const joined = Array.isArray(row.players) ? row.players[0] : row.players;
    if (!joined) continue;
    const current = board.get(row.user_id) ?? { handle: joined.handle, rating: joined.rating, wpm: 0, accuracy: 0, sessions: 0 };
    current.wpm += row.net_wpm; current.accuracy += row.accuracy; current.sessions += 1;
    board.set(row.user_id, current);
  }
  const leaderboard = Array.from(board.values()).map((entry) => ({
    handle: entry.handle,
    averageWpm: round(entry.wpm / entry.sessions),
    accuracy: round(entry.accuracy / entry.sessions),
    sessions: entry.sessions,
    rating: entry.rating,
  })).sort((a, b) => b.averageWpm - a.averageWpm || b.accuracy - a.accuracy).slice(0, 10);

  let stats = { sessions: 0, averageWpm: 0, bestWpm: 0, accuracy: 0, activeDays: 0 };
  let latestRanked: Record<string, unknown> | null = null;
  if (player) {
    const runs = await db.from('sessions').select('net_wpm, accuracy, created_at')
      .eq('user_id', player.id).eq('risk_status', 'clear').gte('created_at', cutoff);
    if (runs.error) throw runs.error;
    if (runs.data?.length) {
      stats = {
        sessions: runs.data.length,
        averageWpm: round(runs.data.reduce((sum, run) => sum + run.net_wpm, 0) / runs.data.length),
        bestWpm: round(Math.max(...runs.data.map((run) => run.net_wpm))),
        accuracy: round(runs.data.reduce((sum, run) => sum + run.accuracy, 0) / runs.data.length),
        activeDays: new Set(runs.data.map((run) => run.created_at.slice(0, 10))).size,
      };
    }
    const latest = await db.from('sessions').select('match_status, outcome, rating_delta, created_at')
      .eq('user_id', player.id).eq('mode', 'ranked').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (latest.error) throw latest.error;
    if (latest.data) latestRanked = {
      matchStatus: latest.data.match_status,
      outcome: latest.data.outcome,
      ratingDelta: latest.data.rating_delta,
      createdAt: latest.data.created_at,
    };
  }

  return {
    user: player ? {
      signedIn: true,
      handle: player.handle,
      xp: player.xp,
      rating: Math.round(player.rating),
      gamesPlayed: player.games_played,
      wins: player.wins,
      losses: player.losses,
      draws: player.draws,
      doubleXpUntil: player.double_xp_until,
    } : { signedIn: false },
    stats,
    leaderboard,
    latestRanked,
  };
}

async function submitSession(request: Request, user: User | null) {
  const body = await request.json() as {
    mode?: GameMode; passageId?: string; input?: string; elapsedMs?: number;
    totalTypedChars?: number; ageBand?: 'under13' | 'teen' | 'adult';
  };
  const mode = body.mode;
  const passage = body.passageId ? getPassage(body.passageId) : undefined;
  const input = typeof body.input === 'string' ? body.input.slice(0, 1_000) : '';
  const elapsedMs = Number(body.elapsedMs);
  const totalTypedChars = Number(body.totalTypedChars);
  if (!mode || !['practice', 'friendly', 'ranked'].includes(mode) || !passage) return json({ error: 'Invalid race.' }, 400);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 1_000 || elapsedMs > 121_000) return json({ error: 'Invalid race timing.' }, 400);
  if (!Number.isFinite(totalTypedChars) || totalTypedChars < input.length || totalTypedChars > 2_000) return json({ error: 'Invalid input count.' }, 400);

  const metrics = calculateMetrics(passage.text, input, elapsedMs, totalTypedChars);
  const riskStatus = metrics.grossWpm > 260 || totalTypedChars / Math.max(1, elapsedMs / 1_000) > 24 ? 'review' : 'clear';
  const baseXp = xpForMode(mode);
  if (body.ageBand === 'under13') return json({ metrics, xpEarned: baseXp, xpMultiplier: 1, saved: false, riskStatus, match: null });
  if (body.ageBand !== 'teen' && body.ageBand !== 'adult') return json({ error: 'Choose an age range before saving or competing.' }, 400);
  if (!user) {
    if (mode === 'ranked') return json({ error: 'Sign in to submit a ranked run.' }, 401);
    return json({ metrics, xpEarned: baseXp, xpMultiplier: 1, saved: false, riskStatus, match: null });
  }

  const player = await ensurePlayer(user);
  const doubleXpActive = Boolean(player.double_xp_until && Date.parse(player.double_xp_until) > Date.now());
  const xpMultiplier = doubleXpActive ? 2 : 1;
  const xpEarned = baseXp * xpMultiplier;
  const matchStatus = mode === 'ranked' && riskStatus === 'clear' ? 'pending' : 'none';
  const inserted = await db.rpc('tr_insert_session', {
    p_user_id: player.id, p_mode: mode, p_passage_id: passage.id,
    p_duration_ms: Math.round(elapsedMs), p_total_typed_chars: Math.round(totalTypedChars),
    p_correct_chars: metrics.correctChars, p_incorrect_chars: metrics.incorrectChars,
    p_gross_wpm: metrics.grossWpm, p_net_wpm: metrics.netWpm, p_accuracy: metrics.accuracy,
    p_performance_score: metrics.performanceScore, p_xp_earned: xpEarned,
    p_risk_status: riskStatus, p_match_status: matchStatus,
  });
  if (inserted.error) throw inserted.error;
  const session = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data;
  const match = mode === 'ranked' && riskStatus === 'clear'
    ? await tryRankedMatch(session.id, player.id, passage.id)
    : null;

  return json({
    metrics, xpEarned, xpMultiplier,
    doubleXpUntil: match?.doubleXpUntil ?? player.double_xp_until,
    saved: true, riskStatus, sessionId: session.id, match,
  });
}

async function tryRankedMatch(sessionId: string, userId: string, passageId: string) {
  const claimed = await db.rpc('tr_claim_ranked_pair', {
    p_session_id: sessionId, p_user_id: userId, p_passage_id: passageId,
  });
  if (claimed.error) throw claimed.error;
  const pair = Array.isArray(claimed.data) ? claimed.data[0] : claimed.data;
  if (!pair) return { status: 'pending' };

  try {
    const players = await db.from('players').select('*').in('id', [pair.current_user_id, pair.opponent_user_id]);
    if (players.error) throw players.error;
    const currentPlayer = players.data?.find((player) => player.id === pair.current_user_id) as PlayerRow | undefined;
    const opponentPlayer = players.data?.find((player) => player.id === pair.opponent_user_id) as PlayerRow | undefined;
    if (!currentPlayer || !opponentPlayer) throw new Error('Ranked players unavailable.');

    const decision = decideWinner(
      { accuracy: pair.current_accuracy, performanceScore: pair.current_performance_score },
      { accuracy: pair.opponent_accuracy, performanceScore: pair.opponent_performance_score },
    );
    const currentScore = decision === 'a' ? 1 : decision === 'b' ? 0 : 0.5;
    const opponentScore = 1 - currentScore;
    const currentUpdated = updateGlicko2(currentPlayer, opponentPlayer, currentScore as 0 | 0.5 | 1);
    const opponentUpdated = updateGlicko2(opponentPlayer, currentPlayer, opponentScore as 0 | 0.5 | 1);
    const currentOutcome = decision === 'a' ? 'win' : decision === 'b' ? 'loss' : 'draw';
    const opponentOutcome = decision === 'b' ? 'win' : decision === 'a' ? 'loss' : 'draw';
    const boostUntil = new Date(Date.now() + DOUBLE_XP_MS).toISOString();
    const finalized = await db.rpc('tr_finalize_ranked_match', {
      p_current_session_id: pair.current_session_id,
      p_opponent_session_id: pair.opponent_session_id,
      p_current_rating: currentUpdated.rating,
      p_current_deviation: currentUpdated.deviation,
      p_current_volatility: currentUpdated.volatility,
      p_current_outcome: currentOutcome,
      p_current_delta: currentUpdated.rating - currentPlayer.rating,
      p_opponent_rating: opponentUpdated.rating,
      p_opponent_deviation: opponentUpdated.deviation,
      p_opponent_volatility: opponentUpdated.volatility,
      p_opponent_outcome: opponentOutcome,
      p_opponent_delta: opponentUpdated.rating - opponentPlayer.rating,
      p_winner_session_id: decision === 'draw' ? null : decision === 'a' ? pair.current_session_id : pair.opponent_session_id,
      p_boost_until: boostUntil,
    });
    if (finalized.error) throw finalized.error;
    return {
      status: 'matched', outcome: currentOutcome, opponentHandle: opponentPlayer.handle,
      opponentScore: pair.opponent_performance_score,
      ratingDelta: round(currentUpdated.rating - currentPlayer.rating),
      rating: round(currentUpdated.rating),
      doubleXpUntil: currentOutcome === 'win' ? boostUntil : currentPlayer.double_xp_until,
    };
  } catch (error) {
    await db.from('sessions').update({ match_status: 'pending' })
      .in('id', [pair.current_session_id, pair.opponent_session_id]).eq('match_status', 'matching');
    throw error;
  }
}

async function createChallenge(request: Request, user: User | null) {
  if (!user) return json({ error: 'Sign in to create a friendly challenge.' }, 401);
  const body = await request.json() as {
    passageId?: string; durationSec?: number; input?: string; elapsedMs?: number;
    totalTypedChars?: number; ageBand?: 'under13' | 'teen' | 'adult';
  };
  if (body.ageBand !== 'teen' && body.ageBand !== 'adult') return json({ error: 'Friendly challenges are available for players 13 and older.' }, 403);
  const passage = body.passageId ? getPassage(body.passageId) : undefined;
  const durationSec = Number(body.durationSec);
  const input = typeof body.input === 'string' ? body.input.slice(0, 1_000) : '';
  const elapsedMs = Number(body.elapsedMs);
  const totalTypedChars = Number(body.totalTypedChars);
  if (!passage || ![30, 45, 60, 120].includes(durationSec) || elapsedMs < 1_000 || elapsedMs > 121_000) return json({ error: 'Invalid challenge run.' }, 400);
  const metrics = calculateMetrics(passage.text, input, elapsedMs, totalTypedChars);
  if (metrics.grossWpm > 260) return json({ error: 'This run needs review before sharing.' }, 422);

  const player = await ensurePlayer(user);
  const code = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
  const created = await db.from('challenges').insert({
    code, creator_user_id: player.id, creator_handle: player.handle, passage_id: passage.id,
    duration_sec: durationSec, creator_input: input, creator_elapsed_ms: Math.round(elapsedMs),
    creator_total_typed_chars: Math.round(totalTypedChars), expires_at: expiresAt,
  });
  if (created.error) throw created.error;
  return json({ code, creatorHandle: player.handle, metrics, path: `/?challenge=${code}`, expiresAt });
}

async function loadChallenge(code: string) {
  const loaded = await db.from('challenges').select('*').eq('code', code.toUpperCase())
    .gt('expires_at', new Date().toISOString()).maybeSingle();
  if (loaded.error) throw loaded.error;
  if (!loaded.data) return json({ error: 'Challenge not found or expired.' }, 404);
  const passage = getPassage(loaded.data.passage_id);
  if (!passage) return json({ error: 'Challenge passage is unavailable.' }, 404);
  const creatorMetrics = calculateMetrics(passage.text, loaded.data.creator_input, loaded.data.creator_elapsed_ms, loaded.data.creator_total_typed_chars);
  return json({
    code: loaded.data.code, creatorHandle: loaded.data.creator_handle, passageId: passage.id,
    durationSec: loaded.data.duration_sec,
    creatorMetrics: { netWpm: creatorMetrics.netWpm, accuracy: creatorMetrics.accuracy },
    expiresAt: loaded.data.expires_at,
  });
}

async function attemptChallenge(request: Request, code: string, user: User | null) {
  const loaded = await db.from('challenges').select('*').eq('code', code.toUpperCase())
    .gt('expires_at', new Date().toISOString()).maybeSingle();
  if (loaded.error) throw loaded.error;
  if (!loaded.data) return json({ error: 'Challenge not found or expired.' }, 404);
  const passage = getPassage(loaded.data.passage_id);
  if (!passage) return json({ error: 'Challenge passage is unavailable.' }, 404);
  const body = await request.json() as { input?: string; elapsedMs?: number; totalTypedChars?: number; ageBand?: 'under13' | 'teen' | 'adult' };
  if (body.ageBand !== 'teen' && body.ageBand !== 'adult') return json({ error: 'Friendly challenges are available for players 13 and older.' }, 403);
  const input = typeof body.input === 'string' ? body.input.slice(0, 1_000) : '';
  const elapsedMs = Number(body.elapsedMs);
  const totalTypedChars = Number(body.totalTypedChars);
  if (elapsedMs < 1_000 || elapsedMs > 121_000 || totalTypedChars < input.length || totalTypedChars > 2_000) return json({ error: 'Invalid challenge attempt.' }, 400);

  const challenger = calculateMetrics(passage.text, input, elapsedMs, totalTypedChars);
  const creator = calculateMetrics(passage.text, loaded.data.creator_input, loaded.data.creator_elapsed_ms, loaded.data.creator_total_typed_chars);
  const decision = decideWinner(challenger, creator);
  const outcome = decision === 'a' ? 'win' : decision === 'b' ? 'loss' : 'draw';
  if (!user) return json({ outcome, challenger, creator, creatorHandle: loaded.data.creator_handle, saved: false, xpEarned: 10, xpMultiplier: 1, doubleXpUntil: null });

  const player = await ensurePlayer(user);
  const xpMultiplier = player.double_xp_until && Date.parse(player.double_xp_until) > Date.now() ? 2 : 1;
  const xpEarned = 10 * xpMultiplier;
  const boostUntil = new Date(Date.now() + DOUBLE_XP_MS).toISOString();
  const recorded = await db.rpc('tr_record_challenge_attempt', {
    p_challenge_id: loaded.data.id, p_user_id: player.id, p_input: input,
    p_elapsed_ms: Math.round(elapsedMs), p_total_typed_chars: Math.round(totalTypedChars),
    p_net_wpm: challenger.netWpm, p_accuracy: challenger.accuracy,
    p_performance_score: challenger.performanceScore, p_outcome: outcome,
    p_xp_earned: xpEarned, p_boost_until: boostUntil,
    p_creator_user_id: loaded.data.creator_user_id,
  });
  if (recorded.error) throw recorded.error;
  return json({
    outcome, challenger, creator, creatorHandle: loaded.data.creator_handle, saved: true,
    xpEarned, xpMultiplier,
    doubleXpUntil: outcome === 'win' ? boostUntil : player.double_xp_until,
  });
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
