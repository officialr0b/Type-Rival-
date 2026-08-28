import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '../../../lib/supabase-auth';
import { ensureDatabase, ensurePlayer, getD1 } from '../../../db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await ensureDatabase();
    const d1 = getD1();
    const user = await getSupabaseUser(request);
    const ageBand = request.nextUrl.searchParams.get('ageBand');
    const eligibleForOnlinePlay = ageBand === 'teen' || ageBand === 'adult';
    const player = user && eligibleForOnlinePlay ? await ensurePlayer(user.userId, user.displayName) : null;
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();

    const leaderboard = await d1.prepare(`
      SELECT p.handle,
             ROUND(AVG(s.net_wpm), 1) AS averageWpm,
             ROUND(AVG(s.accuracy), 1) AS accuracy,
             COUNT(*) AS sessions,
             p.rating
      FROM sessions s
      JOIN players p ON p.id = s.user_id
      WHERE s.risk_status = 'clear'
        AND s.created_at >= ?
      GROUP BY p.id, p.handle, p.rating
      ORDER BY averageWpm DESC, accuracy DESC
      LIMIT 10
    `).bind(cutoff).all();

    const stats = player
      ? await d1.prepare(`
          SELECT COUNT(*) AS sessions,
                 ROUND(AVG(net_wpm), 1) AS averageWpm,
                 ROUND(MAX(net_wpm), 1) AS bestWpm,
                 ROUND(AVG(accuracy), 1) AS accuracy,
                 COUNT(DISTINCT date(created_at)) AS activeDays
          FROM sessions
          WHERE user_id = ? AND risk_status = 'clear' AND created_at >= ?
        `).bind(player.id, cutoff).first()
      : null;

    const latestRanked = player
      ? await d1.prepare(`
          SELECT id, match_status AS matchStatus, outcome, rating_delta AS ratingDelta, created_at AS createdAt
          FROM sessions WHERE user_id = ? AND mode = 'ranked'
          ORDER BY created_at DESC LIMIT 1
        `).bind(player.id).first()
      : null;

    return NextResponse.json({
      user: user && player ? {
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
      stats: stats ?? { sessions: 0, averageWpm: 0, bestWpm: 0, accuracy: 0, activeDays: 0 },
      leaderboard: leaderboard.results,
      latestRanked,
    });
  } catch (error) {
    console.error('bootstrap_failed', error);
    return NextResponse.json({ error: 'TypeRival could not load player data.' }, { status: 500 });
  }
}
