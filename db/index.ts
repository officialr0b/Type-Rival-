import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

let schemaReady: Promise<void> | null = null;

export function getD1(): D1Database {
  if (!env.DB) throw new Error('TypeRival database is unavailable.');
  return env.DB;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

export async function ensureDatabase(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = initialize();
  return schemaReady;
}

async function initialize() {
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      handle TEXT NOT NULL UNIQUE,
      xp INTEGER NOT NULL DEFAULT 0,
      rating REAL NOT NULL DEFAULT 1500,
      deviation REAL NOT NULL DEFAULT 350,
      volatility REAL NOT NULL DEFAULT 0.06,
      games_played INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      double_xp_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      mode TEXT NOT NULL,
      passage_id TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      total_typed_chars INTEGER NOT NULL,
      correct_chars INTEGER NOT NULL,
      incorrect_chars INTEGER NOT NULL,
      gross_wpm REAL NOT NULL,
      net_wpm REAL NOT NULL,
      accuracy REAL NOT NULL,
      performance_score REAL NOT NULL,
      xp_earned INTEGER NOT NULL,
      risk_status TEXT NOT NULL DEFAULT 'clear',
      match_status TEXT NOT NULL DEFAULT 'none',
      matched_session_id TEXT,
      outcome TEXT,
      rating_delta REAL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES players(id)
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      a_session_id TEXT NOT NULL,
      b_session_id TEXT NOT NULL,
      winner_session_id TEXT,
      algorithm_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (a_session_id) REFERENCES sessions(id),
      FOREIGN KEY (b_session_id) REFERENCES sessions(id)
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      creator_user_id TEXT,
      creator_handle TEXT NOT NULL,
      passage_id TEXT NOT NULL,
      duration_sec INTEGER NOT NULL,
      creator_input TEXT NOT NULL,
      creator_elapsed_ms INTEGER NOT NULL,
      creator_total_typed_chars INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (creator_user_id) REFERENCES players(id)
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS challenge_attempts (
      id TEXT PRIMARY KEY,
      challenge_id TEXT NOT NULL,
      user_id TEXT,
      input TEXT NOT NULL,
      elapsed_ms INTEGER NOT NULL,
      total_typed_chars INTEGER NOT NULL,
      net_wpm REAL NOT NULL,
      accuracy REAL NOT NULL,
      performance_score REAL NOT NULL,
      outcome TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (challenge_id) REFERENCES challenges(id),
      FOREIGN KEY (user_id) REFERENCES players(id)
    )`),
    d1.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_user_created ON sessions(user_id, created_at)'),
    d1.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_ranked_pending ON sessions(mode, passage_id, match_status, created_at)'),
    d1.prepare('CREATE INDEX IF NOT EXISTS idx_challenge_attempts_challenge ON challenge_attempts(challenge_id, created_at)'),
  ]);

  const playerColumns = await d1.prepare('PRAGMA table_info(players)').all<{ name: string }>();
  if (!playerColumns.results.some((column) => column.name === 'double_xp_until')) {
    await d1.prepare('ALTER TABLE players ADD COLUMN double_xp_until TEXT').run();
  }
}

export async function ensurePlayer(userId: string, displayName: string) {
  await ensureDatabase();
  const d1 = getD1();
  const now = new Date().toISOString();
  const existing = await d1.prepare('SELECT * FROM players WHERE id = ?').bind(userId).first<PlayerRow>();
  if (existing) return existing;

  const safeBase = displayName.split('@')[0]?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'Rival';
  const suffix = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || crypto.randomUUID().slice(0, 4).toUpperCase();
  const handle = `${safeBase}${suffix}`;
  await d1.prepare(`INSERT OR IGNORE INTO players
    (id, handle, xp, rating, deviation, volatility, games_played, wins, losses, draws, created_at, updated_at)
    VALUES (?, ?, 0, 1500, 350, 0.06, 0, 0, 0, 0, ?, ?)`)
    .bind(userId, handle, now, now).run();
  return (await d1.prepare('SELECT * FROM players WHERE id = ?').bind(userId).first<PlayerRow>())!;
}

export type PlayerRow = {
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
  created_at: string;
  updated_at: string;
};
