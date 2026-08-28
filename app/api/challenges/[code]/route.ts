import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '../../../../lib/supabase-auth';
import { ensureDatabase, ensurePlayer, getD1 } from '../../../../db';
import { calculateMetrics, decideWinner, getPassage } from '../../../../lib/game';

export const dynamic = 'force-dynamic';
const DOUBLE_XP_MS = 30 * 60 * 1_000;

type Context = { params: Promise<{ code: string }> };

type ChallengeRow = {
  id: string;
  code: string;
  creator_handle: string;
  creator_user_id: string | null;
  passage_id: string;
  duration_sec: number;
  creator_input: string;
  creator_elapsed_ms: number;
  creator_total_typed_chars: number;
  expires_at: string;
};

export async function GET(_request: NextRequest, context: Context) {
  try {
    await ensureDatabase();
    const { code } = await context.params;
    const challenge = await getD1().prepare('SELECT * FROM challenges WHERE code = ? AND expires_at > ?')
      .bind(code.toUpperCase(), new Date().toISOString()).first<ChallengeRow>();
    if (!challenge) return NextResponse.json({ error: 'Challenge not found or expired.' }, { status: 404 });
    const passage = getPassage(challenge.passage_id);
    if (!passage) return NextResponse.json({ error: 'Challenge passage is unavailable.' }, { status: 404 });
    const creatorMetrics = calculateMetrics(passage.text, challenge.creator_input, challenge.creator_elapsed_ms, challenge.creator_total_typed_chars);
    return NextResponse.json({
      code: challenge.code,
      creatorHandle: challenge.creator_handle,
      passageId: passage.id,
      durationSec: challenge.duration_sec,
      creatorMetrics: { netWpm: creatorMetrics.netWpm, accuracy: creatorMetrics.accuracy },
      expiresAt: challenge.expires_at,
    });
  } catch (error) {
    console.error('challenge_load_failed', error);
    return NextResponse.json({ error: 'Challenge could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    await ensureDatabase();
    const { code } = await context.params;
    const challenge = await getD1().prepare('SELECT * FROM challenges WHERE code = ? AND expires_at > ?')
      .bind(code.toUpperCase(), new Date().toISOString()).first<ChallengeRow>();
    if (!challenge) return NextResponse.json({ error: 'Challenge not found or expired.' }, { status: 404 });
    const passage = getPassage(challenge.passage_id);
    if (!passage) return NextResponse.json({ error: 'Challenge passage is unavailable.' }, { status: 404 });
    const body = await request.json() as { input?: string; elapsedMs?: number; totalTypedChars?: number; ageBand?: 'under13' | 'teen' | 'adult' };
    if (body.ageBand !== 'teen' && body.ageBand !== 'adult') {
      return NextResponse.json({ error: 'Friendly challenges are available for players 13 and older.' }, { status: 403 });
    }
    const input = typeof body.input === 'string' ? body.input.slice(0, 1_000) : '';
    const elapsedMs = Number(body.elapsedMs);
    const totalTypedChars = Number(body.totalTypedChars);
    if (elapsedMs < 1_000 || elapsedMs > 121_000 || totalTypedChars < input.length || totalTypedChars > 2_000) {
      return NextResponse.json({ error: 'Invalid challenge attempt.' }, { status: 400 });
    }

    const challenger = calculateMetrics(passage.text, input, elapsedMs, totalTypedChars);
    const creator = calculateMetrics(passage.text, challenge.creator_input, challenge.creator_elapsed_ms, challenge.creator_total_typed_chars);
    const decision = decideWinner(challenger, creator);
    const outcome = decision === 'a' ? 'win' : decision === 'b' ? 'loss' : 'draw';
    const user = await getSupabaseUser(request);
    const player = user ? await ensurePlayer(user.userId, user.displayName) : null;
    const now = new Date().toISOString();
    const boostUntil = new Date(Date.now() + DOUBLE_XP_MS).toISOString();
    const xpMultiplier = player?.double_xp_until && Date.parse(player.double_xp_until) > Date.now() ? 2 : 1;
    const xpEarned = 10 * xpMultiplier;
    const d1 = getD1();
    const statements = [d1.prepare(`INSERT INTO challenge_attempts (
      id, challenge_id, user_id, input, elapsed_ms, total_typed_chars, net_wpm, accuracy,
      performance_score, outcome, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), challenge.id, player?.id ?? null, input, Math.round(elapsedMs),
        Math.round(totalTypedChars), challenger.netWpm, challenger.accuracy, challenger.performanceScore,
        outcome, now)];

    if (player) {
      statements.push(d1.prepare(`UPDATE players SET xp = xp + ?,
        double_xp_until = COALESCE(?, double_xp_until), updated_at = ? WHERE id = ?`)
        .bind(xpEarned, outcome === 'win' ? boostUntil : null, now, player.id));
    }
    if (outcome === 'loss' && challenge.creator_user_id) {
      statements.push(d1.prepare('UPDATE players SET double_xp_until = ?, updated_at = ? WHERE id = ?')
        .bind(boostUntil, now, challenge.creator_user_id));
    }
    await d1.batch(statements);

    return NextResponse.json({
      outcome,
      challenger,
      creator,
      creatorHandle: challenge.creator_handle,
      xpEarned,
      xpMultiplier,
      doubleXpUntil: outcome === 'win' ? boostUntil : player?.double_xp_until ?? null,
    });
  } catch (error) {
    console.error('challenge_attempt_failed', error);
    return NextResponse.json({ error: 'Challenge result could not be saved.' }, { status: 500 });
  }
}
