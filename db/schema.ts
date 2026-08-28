import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  handle: text('handle').notNull(),
  xp: integer('xp').notNull().default(0),
  rating: real('rating').notNull().default(1500),
  deviation: real('deviation').notNull().default(350),
  volatility: real('volatility').notNull().default(0.06),
  gamesPlayed: integer('games_played').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  draws: integer('draws').notNull().default(0),
  doubleXpUntil: text('double_xp_until'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_players_handle').on(table.handle)]);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => players.id),
  mode: text('mode').notNull(),
  passageId: text('passage_id').notNull(),
  durationMs: integer('duration_ms').notNull(),
  totalTypedChars: integer('total_typed_chars').notNull(),
  correctChars: integer('correct_chars').notNull(),
  incorrectChars: integer('incorrect_chars').notNull(),
  grossWpm: real('gross_wpm').notNull(),
  netWpm: real('net_wpm').notNull(),
  accuracy: real('accuracy').notNull(),
  performanceScore: real('performance_score').notNull(),
  xpEarned: integer('xp_earned').notNull(),
  riskStatus: text('risk_status').notNull().default('clear'),
  matchStatus: text('match_status').notNull().default('none'),
  matchedSessionId: text('matched_session_id'),
  outcome: text('outcome'),
  ratingDelta: real('rating_delta'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_sessions_user_created').on(table.userId, table.createdAt),
  index('idx_sessions_ranked_pending').on(table.mode, table.passageId, table.matchStatus, table.createdAt),
]);

export const matches = sqliteTable('matches', {
  id: text('id').primaryKey(),
  aSessionId: text('a_session_id').notNull().references(() => sessions.id),
  bSessionId: text('b_session_id').notNull().references(() => sessions.id),
  winnerSessionId: text('winner_session_id'),
  algorithmVersion: text('algorithm_version').notNull(),
  createdAt: text('created_at').notNull(),
});

export const challenges = sqliteTable('challenges', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  creatorUserId: text('creator_user_id').references(() => players.id),
  creatorHandle: text('creator_handle').notNull(),
  passageId: text('passage_id').notNull(),
  durationSec: integer('duration_sec').notNull(),
  creatorInput: text('creator_input').notNull(),
  creatorElapsedMs: integer('creator_elapsed_ms').notNull(),
  creatorTotalTypedChars: integer('creator_total_typed_chars').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('idx_challenges_code').on(table.code)]);

export const challengeAttempts = sqliteTable('challenge_attempts', {
  id: text('id').primaryKey(),
  challengeId: text('challenge_id').notNull().references(() => challenges.id),
  userId: text('user_id').references(() => players.id),
  input: text('input').notNull(),
  elapsedMs: integer('elapsed_ms').notNull(),
  totalTypedChars: integer('total_typed_chars').notNull(),
  netWpm: real('net_wpm').notNull(),
  accuracy: real('accuracy').notNull(),
  performanceScore: real('performance_score').notNull(),
  outcome: text('outcome').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_challenge_attempts_challenge').on(table.challengeId, table.createdAt)]);
