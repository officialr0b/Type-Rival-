import { createClient, type User } from 'npm:@supabase/supabase-js@2.112.4';
import { calculateMetrics, decideWinner, getPassage, PASSAGES, xpForMode, type DeviceClass, type GameMode } from '../../../lib/game.ts';
import { updateGlicko2 } from '../../../lib/glicko2.ts';
import { createCoachingRun, type CoachingRun, type TypingProfile } from '../../../lib/result-coaching.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const DOUBLE_XP_MS = 30 * 60 * 1_000;
const RANKED_DURATION_SEC = 45;
const RUN_EXPIRY_GRACE_MS = 30_000;
const ALLOWED_ORIGIN = 'https://type-rival-five.vercel.app';
const CORS = {
  'access-control-allow-origin': ALLOWED_ORIGIN,
  'access-control-allow-headers': 'authorization, apikey, content-type, x-typerival-client-ip',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  vary: 'origin',
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

type RunTicketRow = {
  id: string;
  user_id: string;
  mode: GameMode;
  passage_id: string;
  duration_sec: number;
  device_class: DeviceClass | 'unknown';
  issued_at: string;
  started_at: string | null;
  expires_at: string;
  consumed_at: string | null;
};

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  if (request.method === 'OPTIONS') {
    return withRequestId(new Response(null, { status: 204, headers: CORS }), requestId);
  }

  let routeName = 'unknown';
  let user: User | null = null;
  try {
    const url = new URL(request.url);
    const route = routeParts(url.pathname);
    routeName = `${request.method} /${route.join('/')}`;
    user = await authenticatedUser(request);
    if (!await withinRateLimit(request, user, route[0] ?? 'unknown')) {
      return finish(json({ error: 'Too many requests. Please wait a moment and try again.' }, 429), requestId, routeName, startedAt, user);
    }

    let response: Response;
    if (request.method === 'GET' && route[0] === 'bootstrap') {
      response = json(await bootstrap(url, user));
    } else if (request.method === 'POST' && route[0] === 'feedback') {
      response = await submitFeedback(request, user);
    } else if (request.method === 'POST' && route[0] === 'runs') {
      response = await issueRun(request, user);
    } else if (request.method === 'PATCH' && route[0] === 'runs' && route[1]) {
      response = await startRun(route[1], user);
    } else if (request.method === 'POST' && route[0] === 'sessions') {
      response = await submitSession(request, user);
    } else if (request.method === 'GET' && route[0] === 'sessions' && route[1]) {
      response = await loadSessionResult(route[1], user);
    } else if (route[0] === 'account' && route[1] === 'export' && request.method === 'GET') {
      response = await exportAccount(user);
    } else if (route[0] === 'account' && request.method === 'PATCH') {
      response = await updateAccount(request, user);
    } else if (route[0] === 'account' && request.method === 'DELETE') {
      response = await deleteAccount(user);
    } else if (route[0] === 'challenges' && route[1]) {
      response = request.method === 'GET'
        ? await loadChallenge(route[1], user)
        : request.method === 'POST'
          ? await attemptChallenge(request, route[1], user)
          : json({ error: 'Method not allowed.' }, 405);
    } else if (request.method === 'POST' && route[0] === 'challenges') {
      response = await createChallenge(request, user);
    } else {
      response = json({ error: 'TypeRival endpoint not found.' }, 404);
    }
    return finish(response, requestId, routeName, startedAt, user);
  } catch (error) {
    if (error instanceof RequestError) {
      return finish(json({ error: error.message }, error.status), requestId, routeName, startedAt, user);
    }
    const stage = error instanceof ServiceError ? error.stage : `route:${routeName}`;
    console.error(JSON.stringify({
      event: 'typerival_api_failed',
      requestId,
      route: routeName,
      stage,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }));
    const response = json({ error: 'TypeRival could not complete that request.' }, 500);
    response.headers.set('x-typerival-error-stage', stage);
    return finish(response, requestId, routeName, startedAt, user);
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
  const authClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  return error ? null : data.user;
}

async function ensurePlayer(user: User): Promise<PlayerRow> {
  const existing = await admin.from('players').select('*').eq('id', user.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as PlayerRow;

  const suffix = user.id.replace(/[^a-zA-Z0-9]/g, '').slice(-12).toUpperCase();
  const inserted = await admin.from('players')
    .upsert({ id: user.id, handle: `Rival_${suffix}` }, { onConflict: 'id' })
    .select('*')
    .single();
  if (inserted.error) throw inserted.error;
  return inserted.data as PlayerRow;
}

async function bootstrap(url: URL, user: User | null) {
  const eligible = ['teen', 'adult'].includes(url.searchParams.get('ageBand') ?? '');
  let player: PlayerRow | null = null;
  if (user && eligible) {
    try {
      player = await ensurePlayer(user);
    } catch (error) {
      throw new ServiceError('bootstrap:player', error);
    }
  }
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
  const [boardQuery, mobileRankedQuery, desktopRankedQuery] = await Promise.all([
    admin.rpc('tr_get_leaderboard', { p_cutoff: cutoff, p_limit: 10 }),
    admin.rpc('tr_get_ranked_leaderboard', { p_cutoff: cutoff, p_device_class: 'mobile', p_limit: 10 }),
    admin.rpc('tr_get_ranked_leaderboard', { p_cutoff: cutoff, p_device_class: 'desktop', p_limit: 10 }),
  ]);
  if (boardQuery.error) throw new ServiceError('bootstrap:leaderboard', boardQuery.error);
  if (mobileRankedQuery.error) throw new ServiceError('bootstrap:ranked_mobile', mobileRankedQuery.error);
  if (desktopRankedQuery.error) throw new ServiceError('bootstrap:ranked_desktop', desktopRankedQuery.error);
  const mapLeaderboard = (rows: Record<string, unknown>[]) => rows.map((entry) => ({
    handle: String(entry.handle),
    averageWpm: Number(entry.average_wpm),
    accuracy: Number(entry.accuracy),
    sessions: Number(entry.sessions),
    rating: Number(entry.rating),
  }));
  const leaderboard = mapLeaderboard((boardQuery.data ?? []) as Record<string, unknown>[]);
  const rankedLeaderboards = {
    mobile: mapLeaderboard((mobileRankedQuery.data ?? []) as Record<string, unknown>[]),
    desktop: mapLeaderboard((desktopRankedQuery.data ?? []) as Record<string, unknown>[]),
  };

  let stats = { sessions: 0, averageWpm: 0, bestWpm: 0, accuracy: 0, activeDays: 0 };
  let latestRanked: Record<string, unknown> | null = null;
  let coachingHistory: CoachingRun[] = [];
  if (player) {
    const statsQuery = await admin.rpc('tr_get_player_stats', { p_user_id: player.id, p_cutoff: cutoff });
    if (statsQuery.error) throw new ServiceError('bootstrap:stats', statsQuery.error);
    const summary = Array.isArray(statsQuery.data) ? statsQuery.data[0] : statsQuery.data;
    if (summary) {
      stats = {
        sessions: Number(summary.sessions),
        averageWpm: Number(summary.average_wpm),
        bestWpm: Number(summary.best_wpm),
        accuracy: Number(summary.accuracy),
        activeDays: Number(summary.active_days),
      };
    }

    const latest = await admin.from('sessions').select('match_status, outcome, rating_delta, created_at')
      .eq('user_id', player.id).eq('mode', 'ranked').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (latest.error) throw new ServiceError('bootstrap:latest_ranked', latest.error);
    if (latest.data) {
      latestRanked = {
        matchStatus: latest.data.match_status,
        outcome: latest.data.outcome,
        ratingDelta: latest.data.rating_delta,
        createdAt: latest.data.created_at,
      };
    }
    coachingHistory = await loadPracticeCoachingHistory(player.id);
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
    rankedLeaderboards,
    latestRanked,
    coachingHistory,
  };
}

async function loadPracticeCoachingHistory(userId: string): Promise<CoachingRun[]> {
  const selected = await admin.from('practice_coaching_runs')
    .select('session_id, passage_id, total_typed_chars, correct_chars, incorrect_chars, gross_wpm, net_wpm, accuracy, performance_score, corrections, first_try_errors, pause_count, longest_pause_ms, longest_pause_index, mistakes, insight_keys, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(12);
  if (selected.error) throw new ServiceError('bootstrap:coaching_history', selected.error);
  return ((selected.data ?? []) as Record<string, unknown>[]).map((row) => createCoachingRun({
    id: String(row.session_id),
    passageId: String(row.passage_id),
    createdAt: String(row.created_at),
    totalTypedChars: Number(row.total_typed_chars),
    metrics: {
      correctChars: Number(row.correct_chars),
      incorrectChars: Number(row.incorrect_chars),
      grossWpm: Number(row.gross_wpm),
      netWpm: Number(row.net_wpm),
      accuracy: Number(row.accuracy),
      performanceScore: Number(row.performance_score),
    },
    profile: {
      corrections: Number(row.corrections),
      firstTryErrors: Number(row.first_try_errors),
      pauseCount: Number(row.pause_count),
      longestPauseMs: Number(row.longest_pause_ms),
      longestPauseIndex: row.longest_pause_index === null ? null : Number(row.longest_pause_index),
      mistakes: Array.isArray(row.mistakes) ? row.mistakes as TypingProfile['mistakes'] : [],
    },
    insightKeys: Array.isArray(row.insight_keys) ? row.insight_keys.map(String) : [],
  }));
}

async function issueRun(request: Request, user: User | null) {
  if (!user) return json({ error: 'Sign in to authorize a saved run.' }, 401);
  const body = await request.json() as {
    mode?: GameMode;
    passageId?: string;
    durationSec?: number;
    ageBand?: 'under13' | 'teen' | 'adult';
    deviceClass?: DeviceClass;
  };
  if (body.ageBand !== 'teen' && body.ageBand !== 'adult') {
    return json({ error: 'Saved runs are available for players 13 and older.' }, 403);
  }
  if (!body.mode || !['practice', 'friendly', 'ranked', 'challenge'].includes(body.mode)) {
    return json({ error: 'Invalid run mode.' }, 400);
  }
  if (body.deviceClass !== 'mobile' && body.deviceClass !== 'desktop') {
    return json({ error: 'Invalid device class.' }, 400);
  }

  const durationSec = body.mode === 'ranked' ? RANKED_DURATION_SEC : Number(body.durationSec);
  if (![30, 45, 60, 120].includes(durationSec)) return json({ error: 'Invalid run duration.' }, 400);
  const player = await ensurePlayer(user);
  const requestedPassage = body.passageId ? getPassage(body.passageId) : undefined;
  const passage = body.mode === 'ranked'
    ? currentRankedPassage()
    : body.mode === 'challenge'
      ? requestedPassage
      : requestedPassage
        ? await freshPassageForPlayer(player.id, requestedPassage)
        : undefined;
  if (!passage) return json({ error: 'Invalid run passage.' }, 400);

  const expiresAt = new Date(Date.now() + 10 * 60 * 1_000).toISOString();
  const inserted = await admin.from('run_tickets').insert({
    user_id: player.id,
    mode: body.mode,
    passage_id: passage.id,
    duration_sec: durationSec,
    device_class: body.deviceClass,
    expires_at: expiresAt,
  }).select('*').single();
  if (inserted.error) throw inserted.error;
  return json({
    runTicketId: inserted.data.id,
    passageId: passage.id,
    durationSec,
    issuedAt: inserted.data.issued_at,
    expiresAt,
  }, 201);
}

async function startRun(runTicketId: string, user: User | null) {
  if (!user) return json({ error: 'Sign in to start an authorized run.' }, 401);
  const selected = await admin.from('run_tickets').select('*')
    .eq('id', runTicketId).eq('user_id', user.id).maybeSingle();
  if (selected.error) throw selected.error;
  const ticket = selected.data as RunTicketRow | null;
  if (!ticket || ticket.consumed_at || Date.parse(ticket.expires_at) <= Date.now()) {
    return json({ error: 'This run authorization is missing, expired, or already used.' }, 409);
  }
  if (ticket.started_at) {
    return json({ startedAt: ticket.started_at, expiresAt: ticket.expires_at });
  }
  const startedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ticket.duration_sec * 1_000 + RUN_EXPIRY_GRACE_MS).toISOString();
  const updated = await admin.from('run_tickets').update({ started_at: startedAt, expires_at: expiresAt })
    .eq('id', ticket.id).is('started_at', null).is('consumed_at', null)
    .select('started_at, expires_at').maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data) return json({ error: 'This run was already started.' }, 409);
  return json({ startedAt: updated.data.started_at, expiresAt: updated.data.expires_at });
}

async function consumeRunTicket(
  user: User,
  runTicketId: string,
  mode: GameMode,
  passageId: string,
  durationSec: number,
  elapsedMs: number,
) {
  const selected = await admin.from('run_tickets').select('*')
    .eq('id', runTicketId).eq('user_id', user.id).maybeSingle();
  if (selected.error) throw selected.error;
  const ticket = selected.data as RunTicketRow | null;
  if (!ticket || !ticket.started_at || ticket.consumed_at || Date.parse(ticket.expires_at) <= Date.now()) {
    throw new RequestError('This run authorization is missing, expired, or already used.', 409);
  }
  if (ticket.mode !== mode || ticket.passage_id !== passageId || ticket.duration_sec !== durationSec) {
    throw new RequestError('This result does not match its authorized run.', 409);
  }
  const serverElapsed = Date.now() - Date.parse(ticket.started_at);
  if (elapsedMs > durationSec * 1_000 + 1_500 || elapsedMs > serverElapsed + 1_500 || serverElapsed > durationSec * 1_000 + RUN_EXPIRY_GRACE_MS) {
    throw new RequestError('This run did not pass the server timing check.', 422);
  }

  const consumed = await admin.from('run_tickets')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', ticket.id).is('consumed_at', null)
    .select('id').maybeSingle();
  if (consumed.error) throw consumed.error;
  if (!consumed.data) throw new RequestError('This run authorization was already used.', 409);
  return ticket;
}

async function submitSession(request: Request, user: User | null) {
  const body = await request.json() as {
    mode?: GameMode;
    passageId?: string;
    input?: string;
    elapsedMs?: number;
    totalTypedChars?: number;
    durationSec?: number;
    runTicketId?: string;
    ageBand?: 'under13' | 'teen' | 'adult';
    typingProfile?: unknown;
    coachingInsightKeys?: unknown;
  };
  const mode = body.mode;
  const passage = body.passageId ? getPassage(body.passageId) : undefined;
  const input = typeof body.input === 'string' ? body.input.slice(0, 1_000) : '';
  const elapsedMs = Number(body.elapsedMs);
  const totalTypedChars = Number(body.totalTypedChars);
  const durationSec = Number(body.durationSec);
  if (!mode || !['practice', 'friendly', 'ranked'].includes(mode) || !passage) return json({ error: 'Invalid race.' }, 400);
  if (![30, 45, 60, 120].includes(durationSec) || (mode === 'ranked' && durationSec !== RANKED_DURATION_SEC)) {
    return json({ error: 'Invalid race duration.' }, 400);
  }
  if (!Number.isFinite(elapsedMs) || elapsedMs < 1_000 || elapsedMs > durationSec * 1_000 + 1_500) {
    return json({ error: 'Invalid race timing.' }, 400);
  }
  if (!Number.isFinite(totalTypedChars) || totalTypedChars < input.length || totalTypedChars > 2_000) {
    return json({ error: 'Invalid input count.' }, 400);
  }

  const metrics = calculateMetrics(passage.text, input, elapsedMs, totalTypedChars);
  const coachingProfile = mode === 'practice' ? sanitizeTypingProfile(body.typingProfile) : emptySubmittedTypingProfile();
  const coachingInsightKeys = mode === 'practice' ? sanitizeInsightKeys(body.coachingInsightKeys) : [];
  const riskStatus = runRiskStatus(metrics.grossWpm, totalTypedChars, elapsedMs);
  const baseXp = xpForMode(mode);
  if (body.ageBand === 'under13') {
    return json({ metrics, xpEarned: baseXp, xpMultiplier: 1, saved: false, riskStatus, match: null });
  }
  if (body.ageBand !== 'teen' && body.ageBand !== 'adult') {
    return json({ error: 'Choose an age range before saving or competing.' }, 400);
  }
  if (!user) {
    if (mode === 'ranked') return json({ error: 'Sign in to submit a ranked run.' }, 401);
    return json({ metrics, xpEarned: baseXp, xpMultiplier: 1, saved: false, riskStatus, match: null });
  }
  if (typeof body.runTicketId !== 'string') return json({ error: 'Start a new authorized run before submitting.' }, 409);
  const ticket = await consumeRunTicket(user, body.runTicketId, mode, passage.id, durationSec, elapsedMs);

  const player = await ensurePlayer(user);
  const doubleXpActive = Boolean(player.double_xp_until && Date.parse(player.double_xp_until) > Date.now());
  const xpMultiplier = doubleXpActive ? 2 : 1;
  const xpEarned = baseXp * xpMultiplier;
  const matchStatus = mode === 'ranked' && riskStatus === 'clear' ? 'pending' : 'none';
  const inserted = await admin.rpc('tr_insert_session', {
    p_user_id: player.id,
    p_mode: mode,
    p_passage_id: passage.id,
    p_duration_ms: Math.round(elapsedMs),
    p_total_typed_chars: Math.round(totalTypedChars),
    p_correct_chars: metrics.correctChars,
    p_incorrect_chars: metrics.incorrectChars,
    p_gross_wpm: metrics.grossWpm,
    p_net_wpm: metrics.netWpm,
    p_accuracy: metrics.accuracy,
    p_performance_score: metrics.performanceScore,
    p_xp_earned: xpEarned,
    p_risk_status: riskStatus,
    p_match_status: matchStatus,
    p_run_ticket_id: body.runTicketId,
    p_device_class: ticket.device_class,
    p_coaching_corrections: coachingProfile.corrections,
    p_coaching_first_try_errors: coachingProfile.firstTryErrors,
    p_coaching_pause_count: coachingProfile.pauseCount,
    p_coaching_longest_pause_ms: coachingProfile.longestPauseMs,
    p_coaching_longest_pause_index: coachingProfile.longestPauseIndex,
    p_coaching_mistakes: coachingProfile.mistakes,
    p_coaching_insight_keys: coachingInsightKeys,
  });
  if (inserted.error) throw inserted.error;
  const session = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data;
  const match = mode === 'ranked' && riskStatus === 'clear'
    ? await tryRankedMatch(session.id, player, passage.id, ticket.device_class)
    : null;

  return json({
    metrics,
    xpEarned,
    xpMultiplier,
    doubleXpUntil: match?.doubleXpUntil ?? player.double_xp_until,
    saved: true,
    riskStatus,
    sessionId: session.id,
    match,
  });
}

async function loadSessionResult(sessionId: string, user: User | null) {
  if (!user) return json({ error: 'Sign in to view a ranked result.' }, 401);
  const selected = await admin.from('sessions')
    .select('id, user_id, mode, match_status, matched_session_id, outcome, rating_delta')
    .eq('id', sessionId).eq('user_id', user.id).eq('mode', 'ranked').maybeSingle();
  if (selected.error) throw selected.error;
  if (!selected.data) return json({ error: 'Ranked result not found.' }, 404);
  if (selected.data.match_status !== 'matched' || !selected.data.matched_session_id) {
    return json({ match: { status: selected.data.match_status } });
  }

  const [opponentSession, currentPlayer] = await Promise.all([
    admin.from('sessions')
      .select('id, user_id, correct_chars, incorrect_chars, gross_wpm, net_wpm, accuracy, performance_score')
      .eq('id', selected.data.matched_session_id).maybeSingle(),
    admin.from('players').select('rating, double_xp_until').eq('id', user.id).maybeSingle(),
  ]);
  if (opponentSession.error) throw opponentSession.error;
  if (currentPlayer.error) throw currentPlayer.error;
  if (!opponentSession.data || !currentPlayer.data) {
    throw new ServiceError('ranked_result:linked_rows', new Error('Ranked match details unavailable.'));
  }
  const handle = await admin.from('players').select('handle').eq('id', opponentSession.data.user_id).maybeSingle();
  if (handle.error) throw handle.error;
  if (!handle.data) throw new ServiceError('ranked_result:opponent', new Error('Ranked opponent unavailable.'));

  const opponentMetrics = storedSessionMetrics(opponentSession.data);
  return json({
    match: {
      status: 'matched',
      outcome: selected.data.outcome,
      opponentHandle: handle.data.handle,
      opponentScore: opponentMetrics.performanceScore,
      opponentMetrics,
      ratingDelta: round(selected.data.rating_delta ?? 0),
      rating: round(currentPlayer.data.rating),
      doubleXpUntil: currentPlayer.data.double_xp_until,
    },
  });
}

async function tryRankedMatch(sessionId: string, player: PlayerRow, passageId: string, deviceClass: DeviceClass | 'unknown') {
  const claimed = await admin.rpc('tr_claim_ranked_pair', {
    p_session_id: sessionId,
    p_user_id: player.id,
    p_passage_id: passageId,
    p_device_class: deviceClass,
    p_current_rating: player.rating,
    p_rating_window: 250,
  });
  if (claimed.error) throw claimed.error;
  const pair = Array.isArray(claimed.data) ? claimed.data[0] : claimed.data;
  if (!pair) return { status: 'pending' };

  try {
    const [players, sessions] = await Promise.all([
      admin.from('players').select('*').in('id', [pair.current_user_id, pair.opponent_user_id]),
      admin.from('sessions')
        .select('id, correct_chars, incorrect_chars, gross_wpm, net_wpm, accuracy, performance_score')
        .in('id', [pair.current_session_id, pair.opponent_session_id]),
    ]);
    if (players.error) throw players.error;
    if (sessions.error) throw sessions.error;
    const currentPlayer = players.data?.find((entry) => entry.id === pair.current_user_id) as PlayerRow | undefined;
    const opponentPlayer = players.data?.find((entry) => entry.id === pair.opponent_user_id) as PlayerRow | undefined;
    const opponentSession = sessions.data?.find((entry) => entry.id === pair.opponent_session_id);
    if (!currentPlayer || !opponentPlayer || !opponentSession) throw new Error('Ranked players unavailable.');

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
    const finalized = await admin.rpc('tr_finalize_ranked_match', {
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
      status: 'matched',
      outcome: currentOutcome,
      opponentHandle: opponentPlayer.handle,
      opponentScore: pair.opponent_performance_score,
      opponentMetrics: storedSessionMetrics(opponentSession),
      ratingDelta: round(currentUpdated.rating - currentPlayer.rating),
      rating: round(currentUpdated.rating),
      doubleXpUntil: currentOutcome === 'win' ? boostUntil : currentPlayer.double_xp_until,
    };
  } catch (error) {
    await admin.from('sessions').update({ match_status: 'pending' })
      .in('id', [pair.current_session_id, pair.opponent_session_id]).eq('match_status', 'matching');
    throw error;
  }
}

function storedSessionMetrics(row: Record<string, unknown>) {
  return {
    correctChars: Number(row.correct_chars),
    incorrectChars: Number(row.incorrect_chars),
    grossWpm: Number(row.gross_wpm),
    netWpm: Number(row.net_wpm),
    accuracy: Number(row.accuracy),
    performanceScore: Number(row.performance_score),
  };
}

async function createChallenge(request: Request, user: User | null) {
  if (!user) return json({ error: 'Sign in to create a friendly challenge.' }, 401);
  const body = await request.json() as {
    sessionId?: string;
    passageId?: string;
    durationSec?: number;
    input?: string;
    elapsedMs?: number;
    totalTypedChars?: number;
    ageBand?: 'under13' | 'teen' | 'adult';
  };
  if (body.ageBand !== 'teen' && body.ageBand !== 'adult') {
    return json({ error: 'Friendly challenges are available for players 13 and older.' }, 403);
  }
  const passage = body.passageId ? getPassage(body.passageId) : undefined;
  const durationSec = Number(body.durationSec);
  const input = typeof body.input === 'string' ? body.input.slice(0, 1_000) : '';
  const elapsedMs = Number(body.elapsedMs);
  const totalTypedChars = Number(body.totalTypedChars);
  if (!passage || ![30, 45, 60, 120].includes(durationSec) || elapsedMs < 1_000 || elapsedMs > durationSec * 1_000 + 1_500) {
    return json({ error: 'Invalid challenge run.' }, 400);
  }
  if (typeof body.sessionId !== 'string') return json({ error: 'The source run was not saved.' }, 409);

  const player = await ensurePlayer(user);
  const source = await admin.from('sessions').select('id, passage_id, duration_ms, net_wpm, accuracy, risk_status')
    .eq('id', body.sessionId).eq('user_id', player.id).eq('mode', 'friendly').maybeSingle();
  if (source.error) throw source.error;
  if (!source.data || source.data.risk_status !== 'clear' || source.data.passage_id !== passage.id) {
    return json({ error: 'The source run is not eligible for sharing.' }, 422);
  }
  const metrics = calculateMetrics(passage.text, input, elapsedMs, totalTypedChars);
  if (!nearlyEqual(metrics.netWpm, source.data.net_wpm) || !nearlyEqual(metrics.accuracy, source.data.accuracy)) {
    return json({ error: 'The challenge payload does not match its verified run.' }, 409);
  }

  const code = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
  const created = await admin.from('challenges').insert({
    code,
    creator_user_id: player.id,
    creator_handle: player.handle,
    source_session_id: source.data.id,
    passage_id: passage.id,
    duration_sec: durationSec,
    creator_input: input,
    creator_elapsed_ms: Math.round(elapsedMs),
    creator_total_typed_chars: Math.round(totalTypedChars),
    expires_at: expiresAt,
  });
  if (created.error) throw created.error;
  return json({ code, creatorHandle: player.handle, metrics, path: `/?challenge=${code}`, expiresAt });
}

async function loadChallenge(code: string, user: User | null) {
  const loaded = await admin.from('challenges').select('*').eq('code', code.toUpperCase())
    .gt('expires_at', new Date().toISOString()).maybeSingle();
  if (loaded.error) throw loaded.error;
  if (!loaded.data) return json({ error: 'Challenge not found or expired.' }, 404);
  const passage = getPassage(loaded.data.passage_id);
  if (!passage) return json({ error: 'Challenge passage is unavailable.' }, 404);
  const creatorMetrics = calculateMetrics(passage.text, loaded.data.creator_input, loaded.data.creator_elapsed_ms, loaded.data.creator_total_typed_chars);
  let latestAttempt: Record<string, unknown> | undefined;
  if (user?.id === loaded.data.creator_user_id) {
    const [attempt, creator] = await Promise.all([
      admin.from('challenge_attempts')
        .select('user_id, input, elapsed_ms, total_typed_chars, outcome')
        .eq('challenge_id', loaded.data.id).eq('risk_status', 'clear')
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('players').select('double_xp_until').eq('id', user.id).maybeSingle(),
    ]);
    if (attempt.error) throw attempt.error;
    if (creator.error) throw creator.error;
    if (attempt.data) {
      const challenger = attempt.data.user_id
        ? await admin.from('players').select('handle').eq('id', attempt.data.user_id).maybeSingle()
        : null;
      if (challenger?.error) throw challenger.error;
      const challengerOutcome = attempt.data.outcome as 'win' | 'loss' | 'draw';
      latestAttempt = {
        creatorOutcome: challengerOutcome === 'win' ? 'loss' : challengerOutcome === 'loss' ? 'win' : 'draw',
        challengerHandle: challenger?.data?.handle ?? 'Rival',
        challengerMetrics: calculateMetrics(
          passage.text,
          attempt.data.input,
          attempt.data.elapsed_ms,
          attempt.data.total_typed_chars,
        ),
        doubleXpUntil: creator.data?.double_xp_until ?? null,
      };
    }
  }

  return json({
    code: loaded.data.code,
    creatorHandle: loaded.data.creator_handle,
    passageId: passage.id,
    durationSec: loaded.data.duration_sec,
    creatorMetrics: { netWpm: creatorMetrics.netWpm, accuracy: creatorMetrics.accuracy },
    expiresAt: loaded.data.expires_at,
    latestAttempt,
  });
}

async function attemptChallenge(request: Request, code: string, user: User | null) {
  const loaded = await admin.from('challenges').select('*').eq('code', code.toUpperCase())
    .gt('expires_at', new Date().toISOString()).maybeSingle();
  if (loaded.error) throw loaded.error;
  if (!loaded.data) return json({ error: 'Challenge not found or expired.' }, 404);
  const passage = getPassage(loaded.data.passage_id);
  if (!passage) return json({ error: 'Challenge passage is unavailable.' }, 404);
  const body = await request.json() as {
    input?: string;
    elapsedMs?: number;
    totalTypedChars?: number;
    durationSec?: number;
    runTicketId?: string;
    ageBand?: 'under13' | 'teen' | 'adult';
  };
  if (body.ageBand !== 'teen' && body.ageBand !== 'adult') {
    return json({ error: 'Friendly challenges are available for players 13 and older.' }, 403);
  }
  const input = typeof body.input === 'string' ? body.input.slice(0, 1_000) : '';
  const elapsedMs = Number(body.elapsedMs);
  const totalTypedChars = Number(body.totalTypedChars);
  const durationSec = Number(body.durationSec);
  if (durationSec !== loaded.data.duration_sec || elapsedMs < 1_000 || elapsedMs > durationSec * 1_000 + 1_500 || totalTypedChars < input.length || totalTypedChars > 2_000) {
    return json({ error: 'Invalid challenge attempt.' }, 400);
  }

  const challenger = calculateMetrics(passage.text, input, elapsedMs, totalTypedChars);
  const creator = calculateMetrics(passage.text, loaded.data.creator_input, loaded.data.creator_elapsed_ms, loaded.data.creator_total_typed_chars);
  const decision = decideWinner(challenger, creator);
  const outcome = decision === 'a' ? 'win' : decision === 'b' ? 'loss' : 'draw';
  const riskStatus = runRiskStatus(challenger.grossWpm, totalTypedChars, elapsedMs);
  if (!user) {
    return json({ outcome, challenger, creator, creatorHandle: loaded.data.creator_handle, saved: false, xpEarned: 10, xpMultiplier: 1, doubleXpUntil: null, riskStatus });
  }
  if (typeof body.runTicketId !== 'string') return json({ error: 'Start a new authorized run before submitting.' }, 409);
  await consumeRunTicket(user, body.runTicketId, 'challenge', passage.id, durationSec, elapsedMs);
  if (riskStatus === 'review') {
    return json({ outcome, challenger, creator, creatorHandle: loaded.data.creator_handle, saved: false, xpEarned: 0, xpMultiplier: 1, doubleXpUntil: null, riskStatus });
  }

  const player = await ensurePlayer(user);
  const xpMultiplier = player.double_xp_until && Date.parse(player.double_xp_until) > Date.now() ? 2 : 1;
  const xpEarned = 10 * xpMultiplier;
  const boostUntil = new Date(Date.now() + DOUBLE_XP_MS).toISOString();
  const recorded = await admin.rpc('tr_record_challenge_attempt', {
    p_challenge_id: loaded.data.id,
    p_user_id: player.id,
    p_input: input,
    p_elapsed_ms: Math.round(elapsedMs),
    p_total_typed_chars: Math.round(totalTypedChars),
    p_net_wpm: challenger.netWpm,
    p_accuracy: challenger.accuracy,
    p_performance_score: challenger.performanceScore,
    p_outcome: outcome,
    p_xp_earned: xpEarned,
    p_boost_until: boostUntil,
    p_creator_user_id: loaded.data.creator_user_id,
  });
  if (recorded.error) throw recorded.error;
  return json({
    outcome,
    challenger,
    creator,
    creatorHandle: loaded.data.creator_handle,
    saved: true,
    xpEarned,
    xpMultiplier,
    riskStatus,
    doubleXpUntil: outcome === 'win' ? boostUntil : player.double_xp_until,
  });
}

async function updateAccount(request: Request, user: User | null) {
  if (!user) return json({ error: 'Sign in to update your account.' }, 401);
  const body = await request.json() as { handle?: string };
  const handle = typeof body.handle === 'string' ? body.handle.trim() : '';
  if (!/^[A-Za-z0-9_]{3,18}$/.test(handle)) {
    return json({ error: 'Use 3–18 letters, numbers, or underscores.' }, 400);
  }
  const reserved = ['admin', 'moderator', 'typerival', 'support', 'official'];
  if (reserved.some((word) => handle.toLowerCase().includes(word))) {
    return json({ error: 'Choose a different public handle.' }, 400);
  }
  const updated = await admin.from('players').update({ handle, updated_at: new Date().toISOString() })
    .eq('id', user.id).select('handle').single();
  if (updated.error?.code === '23505') return json({ error: 'That handle is already taken.' }, 409);
  if (updated.error) throw updated.error;
  await admin.from('challenges').update({ creator_handle: handle })
    .eq('creator_user_id', user.id).gt('expires_at', new Date().toISOString());
  return json({ handle: updated.data.handle });
}

async function submitFeedback(request: Request, user: User | null) {
  const body = await request.json() as { category?: string; message?: string; device?: string };
  const category = typeof body.category === 'string' ? body.category : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const device = typeof body.device === 'string' ? body.device.trim() : '';
  if (!['bug', 'idea', 'experience', 'other'].includes(category)) {
    return json({ error: 'Choose a feedback category.' }, 400);
  }
  if (message.length < 10 || message.length > 2000) {
    return json({ error: 'Feedback must be between 10 and 2,000 characters.' }, 400);
  }
  if (device.length > 120) {
    return json({ error: 'Device and browser details must be 120 characters or fewer.' }, 400);
  }
  const inserted = await admin.from('feedback_submissions').insert({
    user_id: user?.id ?? null,
    category,
    message,
    device: device || null,
  });
  if (inserted.error) throw inserted.error;
  return json({ received: true }, 201);
}

async function exportAccount(user: User | null) {
  if (!user) return json({ error: 'Sign in to export your account.' }, 401);
  const [profile, sessions, challenges, attempts, feedback, coaching] = await Promise.all([
    admin.from('players').select('*').eq('id', user.id).maybeSingle(),
    admin.from('sessions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    admin.from('challenges').select('*').eq('creator_user_id', user.id).order('created_at', { ascending: false }),
    admin.from('challenge_attempts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    admin.from('feedback_submissions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    admin.from('practice_coaching_runs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
  ]);
  if (profile.error) throw new ServiceError('account_export:profile', profile.error);
  if (sessions.error) throw new ServiceError('account_export:sessions', sessions.error);
  if (challenges.error) throw new ServiceError('account_export:challenges', challenges.error);
  if (attempts.error) throw new ServiceError('account_export:attempts', attempts.error);
  if (feedback.error) throw new ServiceError('account_export:feedback', feedback.error);
  if (coaching.error) throw new ServiceError('account_export:coaching', coaching.error);
  const exportedAt = new Date().toISOString();
  return new Response(JSON.stringify({
    exportedAt,
    account: { id: user.id, email: user.email, createdAt: user.created_at },
    profile: profile.data,
    sessions: sessions.data,
    challenges: challenges.data,
    challengeAttempts: attempts.data,
    feedback: feedback.data,
    practiceCoaching: coaching.data,
  }, null, 2), {
    status: 200,
    headers: {
      ...CORS,
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="typerival-export-${exportedAt.slice(0, 10)}.json"`,
      'cache-control': 'no-store',
    },
  });
}

async function deleteAccount(user: User | null) {
  if (!user) return json({ error: 'Sign in to delete your account.' }, 401);
  const deleted = await admin.auth.admin.deleteUser(user.id, false);
  if (deleted.error) throw deleted.error;
  return json({ deleted: true });
}

async function withinRateLimit(request: Request, user: User | null, action: string) {
  const rules: Record<string, { limit: number; seconds: number }> = {
    bootstrap: { limit: 120, seconds: 60 },
    runs: { limit: 20, seconds: 60 },
    sessions: { limit: 20, seconds: 60 },
    challenges: { limit: 40, seconds: 60 },
    account: { limit: 10, seconds: 60 },
    feedback: { limit: 5, seconds: 60 },
  };
  const rule = rules[action] ?? { limit: 60, seconds: 60 };
  const forwarded = request.headers.get('x-typerival-client-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('cf-connecting-ip')
    ?? 'unknown';
  const identity = user ? `user:${user.id}` : `ip:${await sha256(forwarded)}`;
  const result = await admin.rpc('tr_consume_rate_limit', {
    p_identifier_hash: identity,
    p_action: action,
    p_limit: rule.limit,
    p_window_seconds: rule.seconds,
  });
  if (result.error) throw new ServiceError('rate_limit', result.error);
  return result.data === true;
}

function currentRankedPassage() {
  return PASSAGES[Math.floor(Date.now() / 900_000) % PASSAGES.length] ?? PASSAGES[0]!;
}

async function freshPassageForPlayer(playerId: string, preferred: (typeof PASSAGES)[number]) {
  const recent = await admin.from('sessions').select('passage_id')
    .eq('user_id', playerId)
    .order('created_at', { ascending: false })
    .limit(PASSAGES.length * 3);
  if (recent.error) throw new ServiceError('fresh_passage', recent.error);

  const activeIds = new Set(PASSAGES.map((passage) => passage.id));
  const recentActiveIds = (recent.data ?? [])
    .map((session) => session.passage_id as string)
    .filter((passageId) => activeIds.has(passageId));
  const seen = new Set(recentActiveIds);
  if (activeIds.has(preferred.id) && !seen.has(preferred.id)) return preferred;

  const unseen = PASSAGES.filter((passage) => !seen.has(passage.id));
  if (unseen.length > 0) return randomPassage(unseen);

  const mostRecentId = recentActiveIds[0];
  return randomPassage(PASSAGES.filter((passage) => passage.id !== mostRecentId));
}

function randomPassage(pool: typeof PASSAGES) {
  return pool[Math.floor(Math.random() * pool.length)] ?? PASSAGES[0]!;
}

function emptySubmittedTypingProfile(): TypingProfile {
  return {
    corrections: 0,
    firstTryErrors: 0,
    pauseCount: 0,
    longestPauseMs: 0,
    longestPauseIndex: null,
    mistakes: [],
  };
}

function sanitizeTypingProfile(value: unknown): TypingProfile {
  if (!value || typeof value !== 'object') return emptySubmittedTypingProfile();
  const submitted = value as Record<string, unknown>;
  const mistakes = Array.isArray(submitted.mistakes)
    ? submitted.mistakes.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const mistake = entry as Record<string, unknown>;
        const index = boundedInteger(mistake.index, 0, 2_000);
        const expected = typeof mistake.expected === 'string' ? Array.from(mistake.expected)[0] ?? '' : '';
        const actual = typeof mistake.actual === 'string' ? Array.from(mistake.actual)[0] ?? '' : '';
        return [{ expected, actual, index }];
      }).slice(0, 24)
    : [];
  return {
    corrections: boundedInteger(submitted.corrections, 0, 2_000),
    firstTryErrors: boundedInteger(submitted.firstTryErrors, 0, 2_000),
    pauseCount: boundedInteger(submitted.pauseCount, 0, 2_000),
    longestPauseMs: boundedInteger(submitted.longestPauseMs, 0, 120_000),
    longestPauseIndex: submitted.longestPauseIndex === null || submitted.longestPauseIndex === undefined
      ? null
      : boundedInteger(submitted.longestPauseIndex, 0, 2_000),
    mistakes,
  };
}

function sanitizeInsightKeys(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((key): key is string => typeof key === 'string' && /^[a-z0-9:-]{1,80}$/i.test(key))
    .slice(0, 6);
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.round(numeric)));
}

function runRiskStatus(grossWpm: number, totalTypedChars: number, elapsedMs: number) {
  return grossWpm > 260 || totalTypedChars / Math.max(1, elapsedMs / 1_000) > 24 ? 'review' : 'clear';
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) <= 0.11;
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((entry) => entry.toString(16).padStart(2, '0')).join('');
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function withRequestId(response: Response, requestId: string) {
  response.headers.set('x-request-id', requestId);
  return response;
}

function finish(response: Response, requestId: string, route: string, startedAt: number, user: User | null) {
  console.log(JSON.stringify({
    event: 'typerival_request',
    requestId,
    route,
    status: response.status,
    durationMs: Date.now() - startedAt,
    authenticated: Boolean(user),
  }));
  return withRequestId(response, requestId);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

class ServiceError extends Error {
  constructor(readonly stage: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'ServiceError';
  }
}
