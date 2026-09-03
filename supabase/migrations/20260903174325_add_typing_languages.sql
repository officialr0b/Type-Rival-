alter table public.sessions
  add column if not exists language text not null default 'en'
    check (language in ('en', 'es', 'fr', 'de', 'pt', 'it'));

alter table public.run_tickets
  add column if not exists language text not null default 'en'
    check (language in ('en', 'es', 'fr', 'de', 'pt', 'it'));

alter table public.challenges
  add column if not exists language text not null default 'en'
    check (language in ('en', 'es', 'fr', 'de', 'pt', 'it'));

alter table public.practice_coaching_runs
  add column if not exists language text not null default 'en'
    check (language in ('en', 'es', 'fr', 'de', 'pt', 'it'));

drop index if exists public.idx_sessions_leaderboard_clear;
create index idx_sessions_language_leaderboard_clear
  on public.sessions(language, created_at desc, user_id)
  where risk_status = 'clear';

drop index if exists public.idx_sessions_ranked_device_leaderboard;
create index idx_sessions_ranked_language_device_leaderboard
  on public.sessions(language, device_class, created_at desc, user_id)
  where mode = 'ranked' and risk_status = 'clear';

create index idx_sessions_user_language_created
  on public.sessions(user_id, language, created_at desc);

drop index if exists public.practice_coaching_runs_user_created_idx;
create index practice_coaching_runs_user_language_created_idx
  on public.practice_coaching_runs(user_id, language, created_at desc);

drop function if exists public.tr_get_leaderboard(timestamptz, integer);

create function public.tr_get_leaderboard(
  p_cutoff timestamptz,
  p_language text default 'en',
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
  where s.risk_status = 'clear'
    and s.language = p_language
    and s.created_at >= p_cutoff
  group by p.id, p.handle, p.rating
  order by avg(s.net_wpm) desc, avg(s.accuracy) desc
  limit greatest(1, least(p_limit, 100));
$$;

drop function if exists public.tr_get_ranked_leaderboard(timestamptz, text, integer);

create function public.tr_get_ranked_leaderboard(
  p_cutoff timestamptz,
  p_device_class text,
  p_language text default 'en',
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
  where s.mode = 'ranked'
    and s.risk_status = 'clear'
    and s.device_class = p_device_class
    and s.language = p_language
    and s.created_at >= p_cutoff
  group by p.id, p.handle, p.rating
  order by p.rating desc, avg(s.net_wpm) desc, avg(s.accuracy) desc
  limit greatest(1, least(p_limit, 100));
$$;

drop function if exists public.tr_get_player_stats(uuid, timestamptz);

create function public.tr_get_player_stats(
  p_user_id uuid,
  p_cutoff timestamptz,
  p_language text default 'en'
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
    and s.language = p_language
    and s.risk_status = 'clear'
    and s.created_at >= p_cutoff;
$$;

drop function if exists public.tr_insert_session(
  uuid, text, text, integer, integer, integer, integer, double precision,
  double precision, double precision, double precision, integer, text, text,
  uuid, text, integer, integer, integer, integer, integer, jsonb, text[]
);

create function public.tr_insert_session(
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
  p_run_ticket_id uuid,
  p_language text default 'en',
  p_device_class text default 'unknown',
  p_coaching_corrections integer default 0,
  p_coaching_first_try_errors integer default 0,
  p_coaching_pause_count integer default 0,
  p_coaching_longest_pause_ms integer default 0,
  p_coaching_longest_pause_index integer default null,
  p_coaching_mistakes jsonb default '[]'::jsonb,
  p_coaching_insight_keys text[] default '{}'::text[]
) returns public.sessions
language plpgsql security definer set search_path = ''
as $$
declare inserted public.sessions;
begin
  insert into public.sessions (
    user_id, mode, passage_id, duration_ms, total_typed_chars, correct_chars,
    incorrect_chars, gross_wpm, net_wpm, accuracy, performance_score,
    xp_earned, risk_status, match_status, run_ticket_id, language, device_class
  ) values (
    p_user_id, p_mode, p_passage_id, p_duration_ms, p_total_typed_chars, p_correct_chars,
    p_incorrect_chars, p_gross_wpm, p_net_wpm, p_accuracy, p_performance_score,
    p_xp_earned, p_risk_status, p_match_status, p_run_ticket_id, p_language, p_device_class
  ) returning * into inserted;

  if p_mode = 'practice' then
    insert into public.practice_coaching_runs (
      session_id, user_id, passage_id, language, total_typed_chars, correct_chars,
      incorrect_chars, gross_wpm, net_wpm, accuracy, performance_score, corrections,
      first_try_errors, pause_count, longest_pause_ms, longest_pause_index,
      mistakes, insight_keys, created_at
    ) values (
      inserted.id, p_user_id, p_passage_id, p_language, p_total_typed_chars, p_correct_chars,
      p_incorrect_chars, p_gross_wpm, p_net_wpm, p_accuracy, p_performance_score,
      p_coaching_corrections, p_coaching_first_try_errors, p_coaching_pause_count,
      p_coaching_longest_pause_ms, p_coaching_longest_pause_index,
      coalesce(p_coaching_mistakes, '[]'::jsonb),
      coalesce(p_coaching_insight_keys, '{}'::text[]), inserted.created_at
    );
  end if;

  update public.players
  set xp = xp + p_xp_earned, updated_at = now()
  where id = p_user_id;

  return inserted;
end;
$$;

revoke all on function public.tr_get_leaderboard(timestamptz, text, integer) from public, anon, authenticated;
revoke all on function public.tr_get_ranked_leaderboard(timestamptz, text, text, integer) from public, anon, authenticated;
revoke all on function public.tr_get_player_stats(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.tr_insert_session(
  uuid, text, text, integer, integer, integer, integer, double precision,
  double precision, double precision, double precision, integer, text, text,
  uuid, text, text, integer, integer, integer, integer, integer, jsonb, text[]
) from public, anon, authenticated;

grant execute on function public.tr_get_leaderboard(timestamptz, text, integer) to service_role;
grant execute on function public.tr_get_ranked_leaderboard(timestamptz, text, text, integer) to service_role;
grant execute on function public.tr_get_player_stats(uuid, timestamptz, text) to service_role;
grant execute on function public.tr_insert_session(
  uuid, text, text, integer, integer, integer, integer, double precision,
  double precision, double precision, double precision, integer, text, text,
  uuid, text, text, integer, integer, integer, integer, integer, jsonb, text[]
) to service_role;
