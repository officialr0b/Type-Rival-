import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '../../../lib/supabase-auth';
import { ensureDatabase, ensurePlayer, getD1, type PlayerRow } from '../../../db';
import { calculateMetrics, getPassage, xpForMode, type GameMode, decideWinner } from '../../../lib/game';
import { updateGlicko2 } from '../../../lib/glicko2';

export const dynamic = 'force-dynamic';
const DOUBLE_XP_MS = 30 * 60 * 1_000;

type SessionBody = {
  mode?: GameMode;
  passageId?: string;
  input?: string;
  elapsedMs?: number;
  totalTypedChars?: number;
  ageBand?: 'under13' | 'teen' | 'adult';
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as SessionBody;
    const mode = body.mode;
    const passage = body.passageId ? getPassage(body.passageId) : undefined;
    const input = typeof body.input === 'string' ? body.input.slice(0, 1_000) : '';
    const elapsedMs = Number(body.elapsedMs);
    const totalTypedChars = Number(body.totalTypedChars);
    const eligibleForOnlinePlay = body.ageBand === 'teen' || body.ageBand === 'adult';

    if (!mode || !['practice', 'friendly', 'ranked'].includes(mode) || !passage) {
      return NextResponse.json({ error: 'Invalid race.' }, { status: 400 });
    }
    if (!Number.isFinite(elapsedMs) || elapsedMs < 1_000 || elapsedMs > 121_000) {
      return NextResponse.json({ error: 'Invalid race timing.' }, { status: 400 });
    }
    if (!Number.isFinite(totalTypedChars) || totalTypedChars < input.length || totalTypedChars > 2_000) {
      return NextResponse.json({ error: 'Invalid input count.' }, { status: 400 });
    }

    const metrics = calculateMetrics(passage.text, input, elapsedMs, totalTypedChars);
    const riskStatus = metrics.grossWpm > 260 || totalTypedChars / Math.max(1, elapsedMs / 1_000) > 24
      ? 'review'
      : 'clear';
    const user = await getSupabaseUser(request);
    if (body.ageBand === 'under13') {
      return NextResponse.json({ metrics, xpEarned: xpForMode(mode), saved: false, riskStatus, match: null });
    }
    if (!eligibleForOnlinePlay) {
      return NextResponse.json({ error: 'Choose an age range before saving or competing.' }, { status: 400 });
    }
    if (mode === 'ranked' && !user) {
      return NextResponse.json({ error: 'Sign in to submit a ranked run.' }, { status: 401 });
    }

    const baseXp = xpForMode(mode);
    if (!user) {
      return NextResponse.json({ metrics, xpEarned: baseXp, xpMultiplier: 1, saved: false, riskStatus, match: null });
    }

    await ensureDatabase();
    const player = await ensurePlayer(user.userId, user.displayName);
    const d1 = getD1();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const doubleXpActive = Boolean(player.double_xp_until && Date.parse(player.double_xp_until) > Date.now());
    const xpMultiplier = doubleXpActive ? 2 : 1;
    const xpEarned = baseXp * xpMultiplier;
    const matchStatus = mode === 'ranked' && riskStatus === 'clear' ? 'pending' : 'none';

    await d1.batch([
      d1.prepare(`INSERT INTO sessions (
        id, user_id, mode, passage_id, duration_ms, total_typed_chars, correct_chars,
        incorrect_chars, gross_wpm, net_wpm, accuracy, performance_score, xp_earned,
        risk_status, match_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, player.id, mode, passage.id, Math.round(elapsedMs), Math.round(totalTypedChars),
          metrics.correctChars, metrics.incorrectChars, metrics.grossWpm, metrics.netWpm,
          metrics.accuracy, metrics.performanceScore, xpEarned, riskStatus, matchStatus, now),
      d1.prepare('UPDATE players SET xp = xp + ?, updated_at = ? WHERE id = ?')
        .bind(xpEarned, now, player.id),
    ]);

    const match = mode === 'ranked' && riskStatus === 'clear'
      ? await tryRankedMatch(id, player.id, passage.id)
      : null;

    return NextResponse.json({
      metrics,
      xpEarned,
      xpMultiplier,
      doubleXpUntil: match?.doubleXpUntil ?? player.double_xp_until,
      saved: true,
      riskStatus,
      sessionId: id,
      match,
    });
  } catch (error) {
    console.error('session_submit_failed', error);
    return NextResponse.json({ error: 'The race could not be saved.' }, { status: 500 });
  }
}

type RankedSession = {
  id: string;
  user_id: string;
  accuracy: number;
  performance_score: number;
};

async function tryRankedMatch(sessionId: string, userId: string, passageId: string) {
  const d1 = getD1();
  const opponent = await d1.prepare(`
    SELECT id, user_id, accuracy, performance_score
    FROM sessions
    WHERE mode = 'ranked' AND passage_id = ? AND match_status = 'pending'
      AND user_id != ? AND risk_status = 'clear' AND id != ?
    ORDER BY created_at ASC LIMIT 1
  `).bind(passageId, userId, sessionId).first<RankedSession>();

  if (!opponent) return { status: 'pending' };

  const claim = await d1.prepare(`
    UPDATE sessions SET match_status = 'matching'
    WHERE id IN (?, ?) AND match_status = 'pending'
  `).bind(sessionId, opponent.id).run();

  if ((claim.meta.changes ?? 0) !== 2) {
    await d1.prepare("UPDATE sessions SET match_status = 'pending' WHERE id = ? AND match_status = 'matching'")
      .bind(sessionId).run();
    return { status: 'pending' };
  }

  const current = await d1.prepare('SELECT id, user_id, accuracy, performance_score FROM sessions WHERE id = ?')
    .bind(sessionId).first<RankedSession>();
  const aPlayer = await d1.prepare('SELECT * FROM players WHERE id = ?').bind(userId).first<PlayerRow>();
  const bPlayer = await d1.prepare('SELECT * FROM players WHERE id = ?').bind(opponent.user_id).first<PlayerRow>();
  if (!current || !aPlayer || !bPlayer) return { status: 'pending' };

  const decision = decideWinner(
    { accuracy: current.accuracy, performanceScore: current.performance_score },
    { accuracy: opponent.accuracy, performanceScore: opponent.performance_score },
  );
  const aScore = decision === 'a' ? 1 : decision === 'b' ? 0 : 0.5;
  const bScore = 1 - aScore;
  const aUpdated = updateGlicko2(aPlayer, bPlayer, aScore as 0 | 0.5 | 1);
  const bUpdated = updateGlicko2(bPlayer, aPlayer, bScore as 0 | 0.5 | 1);
  const aOutcome = decision === 'a' ? 'win' : decision === 'b' ? 'loss' : 'draw';
  const bOutcome = decision === 'b' ? 'win' : decision === 'a' ? 'loss' : 'draw';
  const winnerId = decision === 'draw' ? null : decision === 'a' ? current.id : opponent.id;
  const matchId = crypto.randomUUID();
  const now = new Date().toISOString();
  const boostUntil = new Date(Date.now() + DOUBLE_XP_MS).toISOString();
  const aBoostUntil = aOutcome === 'win' ? boostUntil : null;
  const bBoostUntil = bOutcome === 'win' ? boostUntil : null;

  await d1.batch([
    d1.prepare(`UPDATE players SET rating = ?, deviation = ?, volatility = ?, games_played = games_played + 1,
      wins = wins + ?, losses = losses + ?, draws = draws + ?, double_xp_until = COALESCE(?, double_xp_until),
      updated_at = ? WHERE id = ?`)
      .bind(aUpdated.rating, aUpdated.deviation, aUpdated.volatility, aOutcome === 'win' ? 1 : 0,
        aOutcome === 'loss' ? 1 : 0, aOutcome === 'draw' ? 1 : 0, aBoostUntil, now, aPlayer.id),
    d1.prepare(`UPDATE players SET rating = ?, deviation = ?, volatility = ?, games_played = games_played + 1,
      wins = wins + ?, losses = losses + ?, draws = draws + ?, double_xp_until = COALESCE(?, double_xp_until),
      updated_at = ? WHERE id = ?`)
      .bind(bUpdated.rating, bUpdated.deviation, bUpdated.volatility, bOutcome === 'win' ? 1 : 0,
        bOutcome === 'loss' ? 1 : 0, bOutcome === 'draw' ? 1 : 0, bBoostUntil, now, bPlayer.id),
    d1.prepare(`UPDATE sessions SET match_status = 'matched', matched_session_id = ?, outcome = ?, rating_delta = ? WHERE id = ?`)
      .bind(opponent.id, aOutcome, aUpdated.rating - aPlayer.rating, current.id),
    d1.prepare(`UPDATE sessions SET match_status = 'matched', matched_session_id = ?, outcome = ?, rating_delta = ? WHERE id = ?`)
      .bind(current.id, bOutcome, bUpdated.rating - bPlayer.rating, opponent.id),
    d1.prepare(`INSERT INTO matches (id, a_session_id, b_session_id, winner_session_id, algorithm_version, created_at)
      VALUES (?, ?, ?, ?, 'glicko2-v1', ?)`)
      .bind(matchId, current.id, opponent.id, winnerId, now),
  ]);

  return {
    status: 'matched',
    outcome: aOutcome,
    opponentHandle: bPlayer.handle,
    opponentScore: opponent.performance_score,
    ratingDelta: Math.round((aUpdated.rating - aPlayer.rating) * 10) / 10,
    rating: Math.round(aUpdated.rating),
    doubleXpUntil: aBoostUntil ?? aPlayer.double_xp_until,
  };
}
