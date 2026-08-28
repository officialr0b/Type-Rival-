create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  xp integer not null default 0 check (xp >= 0),
  rating double precision not null default 1500,
  deviation double precision not null default 350,
  volatility double precision not null default 0.06,
  games_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  double_xp_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.players(id) on delete cascade,
  mode text not null check (mode in ('practice', 'friendly', 'ranked')),
  passage_id text not null,
  duration_ms integer not null,
  total_typed_chars integer not null,
  correct_chars integer not null,
  incorrect_chars integer not null,
  gross_wpm double precision not null,
  net_wpm double precision not null,
  accuracy double precision not null,
  performance_score double precision not null,
  xp_earned integer not null,
  risk_status text not null default 'clear' check (risk_status in ('clear', 'review')),
  match_status text not null default 'none' check (match_status in ('none', 'pending', 'matching', 'matched')),
  matched_session_id uuid references public.sessions(id),
  outcome text check (outcome in ('win', 'loss', 'draw')),
  rating_delta double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  a_session_id uuid not null references public.sessions(id) on delete cascade,
  b_session_id uuid not null references public.sessions(id) on delete cascade,
  winner_session_id uuid references public.sessions(id) on delete set null,
  algorithm_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  creator_user_id uuid not null references public.players(id) on delete cascade,
  creator_handle text not null,
  passage_id text not null,
  duration_sec integer not null check (duration_sec in (30, 45, 60, 120)),
  creator_input text not null,
  creator_elapsed_ms integer not null,
  creator_total_typed_chars integer not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_attempts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid references public.players(id) on delete set null,
  input text not null,
  elapsed_ms integer not null,
  total_typed_chars integer not null,
  net_wpm double precision not null,
  accuracy double precision not null,
  performance_score double precision not null,
  outcome text not null check (outcome in ('win', 'loss', 'draw')),
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_user_created on public.sessions(user_id, created_at desc);
create index if not exists idx_sessions_ranked_pending on public.sessions(mode, passage_id, match_status, created_at);
create index if not exists idx_challenge_attempts_challenge on public.challenge_attempts(challenge_id, created_at desc);

alter table public.players enable row level security;
alter table public.sessions enable row level security;
alter table public.matches enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_attempts enable row level security;

revoke all on public.players, public.sessions, public.matches, public.challenges, public.challenge_attempts from anon, authenticated;

create or replace function public.tr_insert_session(
  p_user_id uuid,
  p_mode text,
  p_passage_id text,
  p_duration_ms integer,
  p_total_typed_chars integer,
  p_correct_chars integer,
  p_incorrect_chars integer,
  p_gross_wpm double precision,
  p_net_wpm double precision,
  p_accuracy double precision,
  p_performance_score double precision,
  p_xp_earned integer,
  p_risk_status text,
  p_match_status text
) returns public.sessions
language plpgsql security definer set search_path = public
as $$
declare inserted public.sessions;
begin
  insert into public.sessions (
    user_id, mode, passage_id, duration_ms, total_typed_chars, correct_chars,
    incorrect_chars, gross_wpm, net_wpm, accuracy, performance_score,
    xp_earned, risk_status, match_status
  ) values (
    p_user_id, p_mode, p_passage_id, p_duration_ms, p_total_typed_chars, p_correct_chars,
    p_incorrect_chars, p_gross_wpm, p_net_wpm, p_accuracy, p_performance_score,
    p_xp_earned, p_risk_status, p_match_status
  ) returning * into inserted;

  update public.players set xp = xp + p_xp_earned, updated_at = now() where id = p_user_id;
  return inserted;
end;
$$;

create or replace function public.tr_claim_ranked_pair(
  p_session_id uuid,
  p_user_id uuid,
  p_passage_id text
) returns table (
  current_session_id uuid,
  current_user_id uuid,
  current_accuracy double precision,
  current_performance_score double precision,
  opponent_session_id uuid,
  opponent_user_id uuid,
  opponent_accuracy double precision,
  opponent_performance_score double precision
)
language plpgsql security definer set search_path = public
as $$
declare opponent public.sessions; claimed_count integer;
begin
  select * into opponent
  from public.sessions
  where mode = 'ranked' and passage_id = p_passage_id and match_status = 'pending'
    and user_id <> p_user_id and risk_status = 'clear' and id <> p_session_id
  order by created_at asc
  for update skip locked
  limit 1;

  if opponent.id is null then return; end if;

  update public.sessions set match_status = 'matching'
  where id in (p_session_id, opponent.id) and match_status = 'pending';
  get diagnostics claimed_count = row_count;

  if claimed_count <> 2 then
    update public.sessions set match_status = 'pending'
    where id in (p_session_id, opponent.id) and match_status = 'matching';
    return;
  end if;

  return query
  select current_run.id, current_run.user_id, current_run.accuracy, current_run.performance_score,
         opponent.id, opponent.user_id, opponent.accuracy, opponent.performance_score
  from public.sessions current_run where current_run.id = p_session_id and current_run.match_status = 'matching';
end;
$$;

create or replace function public.tr_finalize_ranked_match(
  p_current_session_id uuid,
  p_opponent_session_id uuid,
  p_current_rating double precision,
  p_current_deviation double precision,
  p_current_volatility double precision,
  p_current_outcome text,
  p_current_delta double precision,
  p_opponent_rating double precision,
  p_opponent_deviation double precision,
  p_opponent_volatility double precision,
  p_opponent_outcome text,
  p_opponent_delta double precision,
  p_winner_session_id uuid,
  p_boost_until timestamptz
) returns void
language plpgsql security definer set search_path = public
as $$
declare current_user uuid; opponent_user uuid;
begin
  select user_id into current_user from public.sessions where id = p_current_session_id for update;
  select user_id into opponent_user from public.sessions where id = p_opponent_session_id for update;

  update public.players set rating = p_current_rating, deviation = p_current_deviation,
    volatility = p_current_volatility, games_played = games_played + 1,
    wins = wins + case when p_current_outcome = 'win' then 1 else 0 end,
    losses = losses + case when p_current_outcome = 'loss' then 1 else 0 end,
    draws = draws + case when p_current_outcome = 'draw' then 1 else 0 end,
    double_xp_until = case when p_current_outcome = 'win' then p_boost_until else double_xp_until end,
    updated_at = now() where id = current_user;

  update public.players set rating = p_opponent_rating, deviation = p_opponent_deviation,
    volatility = p_opponent_volatility, games_played = games_played + 1,
    wins = wins + case when p_opponent_outcome = 'win' then 1 else 0 end,
    losses = losses + case when p_opponent_outcome = 'loss' then 1 else 0 end,
    draws = draws + case when p_opponent_outcome = 'draw' then 1 else 0 end,
    double_xp_until = case when p_opponent_outcome = 'win' then p_boost_until else double_xp_until end,
    updated_at = now() where id = opponent_user;

  update public.sessions set match_status = 'matched', matched_session_id = p_opponent_session_id,
    outcome = p_current_outcome, rating_delta = p_current_delta where id = p_current_session_id;
  update public.sessions set match_status = 'matched', matched_session_id = p_current_session_id,
    outcome = p_opponent_outcome, rating_delta = p_opponent_delta where id = p_opponent_session_id;

  insert into public.matches (a_session_id, b_session_id, winner_session_id, algorithm_version)
  values (p_current_session_id, p_opponent_session_id, p_winner_session_id, 'glicko2-v1');
end;
$$;

create or replace function public.tr_record_challenge_attempt(
  p_challenge_id uuid,
  p_user_id uuid,
  p_input text,
  p_elapsed_ms integer,
  p_total_typed_chars integer,
  p_net_wpm double precision,
  p_accuracy double precision,
  p_performance_score double precision,
  p_outcome text,
  p_xp_earned integer,
  p_boost_until timestamptz,
  p_creator_user_id uuid
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.challenge_attempts (
    challenge_id, user_id, input, elapsed_ms, total_typed_chars,
    net_wpm, accuracy, performance_score, outcome
  ) values (
    p_challenge_id, p_user_id, p_input, p_elapsed_ms, p_total_typed_chars,
    p_net_wpm, p_accuracy, p_performance_score, p_outcome
  );

  update public.players set xp = xp + p_xp_earned,
    double_xp_until = case when p_outcome = 'win' then p_boost_until else double_xp_until end,
    updated_at = now() where id = p_user_id;

  if p_outcome = 'loss' then
    update public.players set double_xp_until = p_boost_until, updated_at = now()
    where id = p_creator_user_id;
  end if;
end;
$$;

revoke all on function public.tr_insert_session(uuid, text, text, integer, integer, integer, integer, double precision, double precision, double precision, double precision, integer, text, text) from public, anon, authenticated;
revoke all on function public.tr_claim_ranked_pair(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.tr_finalize_ranked_match(uuid, uuid, double precision, double precision, double precision, text, double precision, double precision, double precision, double precision, text, double precision, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.tr_record_challenge_attempt(uuid, uuid, text, integer, integer, double precision, double precision, double precision, text, integer, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.tr_insert_session(uuid, text, text, integer, integer, integer, integer, double precision, double precision, double precision, double precision, integer, text, text) to service_role;
grant execute on function public.tr_claim_ranked_pair(uuid, uuid, text) to service_role;
grant execute on function public.tr_finalize_ranked_match(uuid, uuid, double precision, double precision, double precision, text, double precision, double precision, double precision, double precision, text, double precision, uuid, timestamptz) to service_role;
grant execute on function public.tr_record_challenge_attempt(uuid, uuid, text, integer, integer, double precision, double precision, double precision, text, integer, timestamptz, uuid) to service_role;
