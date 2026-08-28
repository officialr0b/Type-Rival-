create table if not exists public.run_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.players(id) on delete cascade,
  mode text not null check (mode in ('practice', 'friendly', 'ranked', 'challenge')),
  passage_id text not null,
  duration_sec integer not null check (duration_sec in (30, 45, 60, 120)),
  issued_at timestamptz not null default now(),
  started_at timestamptz,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > issued_at)
);

create table if not exists public.api_rate_limits (
  identifier_hash text not null,
  action text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (identifier_hash, action, window_start)
);

alter table public.sessions
  add column if not exists run_ticket_id uuid references public.run_tickets(id) on delete set null;

alter table public.challenges
  add column if not exists source_session_id uuid references public.sessions(id) on delete cascade;

alter table public.challenge_attempts
  add column if not exists risk_status text not null default 'clear'
    check (risk_status in ('clear', 'review'));

create unique index if not exists idx_sessions_run_ticket
  on public.sessions(run_ticket_id) where run_ticket_id is not null;
create unique index if not exists idx_challenges_source_session
  on public.challenges(source_session_id) where source_session_id is not null;
create index if not exists idx_run_tickets_user_created
  on public.run_tickets(user_id, created_at desc);
create index if not exists idx_run_tickets_expires
  on public.run_tickets(expires_at) where consumed_at is null;
create index if not exists idx_rate_limits_window
  on public.api_rate_limits(window_start);
create index if not exists idx_sessions_leaderboard_clear
  on public.sessions(created_at desc, user_id) where risk_status = 'clear';
create index if not exists idx_sessions_matched_session
  on public.sessions(matched_session_id) where matched_session_id is not null;
create index if not exists idx_matches_a_session on public.matches(a_session_id);
create index if not exists idx_matches_b_session on public.matches(b_session_id);
create index if not exists idx_matches_winner_session
  on public.matches(winner_session_id) where winner_session_id is not null;
create index if not exists idx_challenges_creator_user on public.challenges(creator_user_id);
create index if not exists idx_challenge_attempts_user
  on public.challenge_attempts(user_id) where user_id is not null;

alter table public.run_tickets enable row level security;
alter table public.api_rate_limits enable row level security;

revoke all on public.run_tickets, public.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.run_tickets, public.api_rate_limits to service_role;

drop function if exists public.tr_insert_session(
  uuid, text, text, integer, integer, integer, integer, double precision,
  double precision, double precision, double precision, integer, text, text
);

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
  p_match_status text,
  p_run_ticket_id uuid
) returns public.sessions
language plpgsql security definer set search_path = ''
as $$
declare inserted public.sessions;
begin
  insert into public.sessions (
    user_id, mode, passage_id, duration_ms, total_typed_chars, correct_chars,
    incorrect_chars, gross_wpm, net_wpm, accuracy, performance_score,
    xp_earned, risk_status, match_status, run_ticket_id
  ) values (
    p_user_id, p_mode, p_passage_id, p_duration_ms, p_total_typed_chars, p_correct_chars,
    p_incorrect_chars, p_gross_wpm, p_net_wpm, p_accuracy, p_performance_score,
    p_xp_earned, p_risk_status, p_match_status, p_run_ticket_id
  ) returning * into inserted;

  update public.players
  set xp = xp + p_xp_earned, updated_at = now()
  where id = p_user_id;
  return inserted;
end;
$$;

drop function if exists public.tr_claim_ranked_pair(uuid, uuid, text);

create or replace function public.tr_claim_ranked_pair(
  p_session_id uuid,
  p_user_id uuid,
  p_passage_id text,
  p_current_rating double precision,
  p_rating_window double precision default 250
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
language plpgsql security definer set search_path = ''
as $$
declare opponent public.sessions; claimed_count integer;
begin
  update public.sessions
  set match_status = 'none'
  where mode = 'ranked'
    and match_status = 'pending'
    and created_at < now() - interval '24 hours';

  select candidate.* into opponent
  from public.sessions candidate
  join public.players rival on rival.id = candidate.user_id
  where candidate.mode = 'ranked'
    and candidate.passage_id = p_passage_id
    and candidate.match_status = 'pending'
    and candidate.user_id <> p_user_id
    and candidate.risk_status = 'clear'
    and candidate.id <> p_session_id
    and candidate.created_at >= now() - interval '24 hours'
    and rival.rating between p_current_rating - p_rating_window and p_current_rating + p_rating_window
  order by abs(rival.rating - p_current_rating), candidate.created_at asc
  for update of candidate skip locked
  limit 1;

  if opponent.id is null then return; end if;

  update public.sessions
  set match_status = 'matching'
  where id in (p_session_id, opponent.id) and match_status = 'pending';
  get diagnostics claimed_count = row_count;

  if claimed_count <> 2 then
    update public.sessions
    set match_status = 'pending'
    where id in (p_session_id, opponent.id) and match_status = 'matching';
    return;
  end if;

  return query
  select current_run.id, current_run.user_id, current_run.accuracy, current_run.performance_score,
         opponent.id, opponent.user_id, opponent.accuracy, opponent.performance_score
  from public.sessions current_run
  where current_run.id = p_session_id and current_run.match_status = 'matching';
end;
$$;

create or replace function public.tr_get_leaderboard(
  p_cutoff timestamptz,
  p_limit integer default 10
) returns table (
  handle text,
  average_wpm double precision,
  accuracy double precision,
  sessions bigint,
  rating double precision
)
language sql stable security definer set search_path = ''
as $$
  select p.handle,
         round(avg(s.net_wpm)::numeric, 1)::double precision as average_wpm,
         round(avg(s.accuracy)::numeric, 1)::double precision as accuracy,
         count(*) as sessions,
         p.rating
  from public.sessions s
  join public.players p on p.id = s.user_id
  where s.risk_status = 'clear' and s.created_at >= p_cutoff
  group by p.id, p.handle, p.rating
  order by avg(s.net_wpm) desc, avg(s.accuracy) desc
  limit greatest(1, least(p_limit, 100));
$$;

create or replace function public.tr_get_player_stats(
  p_user_id uuid,
  p_cutoff timestamptz
) returns table (
  sessions bigint,
  average_wpm double precision,
  best_wpm double precision,
  accuracy double precision,
  active_days bigint
)
language sql stable security definer set search_path = ''
as $$
  select count(*) as sessions,
         coalesce(round(avg(s.net_wpm)::numeric, 1)::double precision, 0) as average_wpm,
         coalesce(round(max(s.net_wpm)::numeric, 1)::double precision, 0) as best_wpm,
         coalesce(round(avg(s.accuracy)::numeric, 1)::double precision, 0) as accuracy,
         count(distinct (s.created_at at time zone 'utc')::date) as active_days
  from public.sessions s
  where s.user_id = p_user_id
    and s.risk_status = 'clear'
    and s.created_at >= p_cutoff;
$$;

create or replace function public.tr_consume_rate_limit(
  p_identifier_hash text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  bucket timestamptz;
  accepted integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then return false; end if;
  bucket := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.api_rate_limits(identifier_hash, action, window_start, request_count)
  values (left(p_identifier_hash, 128), left(p_action, 64), bucket, 1)
  on conflict (identifier_hash, action, window_start)
  do update set request_count = public.api_rate_limits.request_count + 1
  where public.api_rate_limits.request_count < p_limit
  returning request_count into accepted;

  if random() < 0.01 then
    delete from public.api_rate_limits where window_start < now() - interval '1 day';
  end if;

  return accepted is not null;
end;
$$;

revoke all on function public.tr_insert_session(uuid, text, text, integer, integer, integer, integer, double precision, double precision, double precision, double precision, integer, text, text, uuid) from public, anon, authenticated;
revoke all on function public.tr_claim_ranked_pair(uuid, uuid, text, double precision, double precision) from public, anon, authenticated;
revoke all on function public.tr_get_leaderboard(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.tr_get_player_stats(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.tr_consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;

grant execute on function public.tr_insert_session(uuid, text, text, integer, integer, integer, integer, double precision, double precision, double precision, double precision, integer, text, text, uuid) to service_role;
grant execute on function public.tr_claim_ranked_pair(uuid, uuid, text, double precision, double precision) to service_role;
grant execute on function public.tr_get_leaderboard(timestamptz, integer) to service_role;
grant execute on function public.tr_get_player_stats(uuid, timestamptz) to service_role;
grant execute on function public.tr_consume_rate_limit(text, text, integer, integer) to service_role;

grant select, insert, update, delete on public.players, public.sessions, public.matches,
  public.challenges, public.challenge_attempts to service_role;

-- Earlier MVP profiles inherited identity-provider names. Replace those one time
-- with non-identifying defaults; players can choose a public handle in Account.
update public.players
set handle = 'Rival_' || upper(right(replace(id::text, '-', ''), 12)),
    updated_at = now();

update public.challenges challenge
set creator_handle = player.handle
from public.players player
where challenge.creator_user_id = player.id;
