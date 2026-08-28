import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '../../../lib/supabase-auth';
import { ensureDatabase, ensurePlayer, getD1 } from '../../../db';
import { calculateMetrics, getPassage } from '../../../lib/game';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      passageId?: string;
      durationSec?: number;
      input?: string;
      elapsedMs?: number;
      totalTypedChars?: number;
      ageBand?: 'under13' | 'teen' | 'adult';
    };
    const passage = body.passageId ? getPassage(body.passageId) : undefined;
    const durationSec = Number(body.durationSec);
    const input = typeof body.input === 'string' ? body.input.slice(0, 1_000) : '';
    const elapsedMs = Number(body.elapsedMs);
    const totalTypedChars = Number(body.totalTypedChars);
    if (body.ageBand !== 'teen' && body.ageBand !== 'adult') {
      return NextResponse.json({ error: 'Friendly challenges are available for players 13 and older.' }, { status: 403 });
    }
    if (!passage || ![30, 45, 60, 120].includes(durationSec) || elapsedMs < 1_000 || elapsedMs > 121_000) {
      return NextResponse.json({ error: 'Invalid challenge run.' }, { status: 400 });
    }
    const metrics = calculateMetrics(passage.text, input, elapsedMs, totalTypedChars);
    if (metrics.grossWpm > 260) return NextResponse.json({ error: 'This run needs review before sharing.' }, { status: 422 });

    await ensureDatabase();
    const user = await getSupabaseUser(request);
    const player = user ? await ensurePlayer(user.userId, user.displayName) : null;
    const d1 = getD1();
    const id = crypto.randomUUID();
    const code = randomCode();
    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
    await d1.prepare(`INSERT INTO challenges (
      id, code, creator_user_id, creator_handle, passage_id, duration_sec, creator_input,
      creator_elapsed_ms, creator_total_typed_chars, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, code, player?.id ?? null, player?.handle ?? 'Guest Rival', passage.id, durationSec,
        input, Math.round(elapsedMs), Math.round(totalTypedChars), expires.toISOString(), now.toISOString()).run();

    return NextResponse.json({
      code,
      creatorHandle: player?.handle ?? 'Guest Rival',
      metrics,
      path: `/?challenge=${code}`,
      expiresAt: expires.toISOString(),
    });
  } catch (error) {
    console.error('challenge_create_failed', error);
    return NextResponse.json({ error: 'The challenge could not be created.' }, { status: 500 });
  }
}

function randomCode() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
}
