alter table public.sessions
  add column if not exists input_method text not null default 'unknown';

alter table public.sessions
  add column if not exists input_telemetry jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_input_method_check'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_input_method_check
      check (input_method in ('mobile_touch', 'mobile_swipe', 'hardware', 'unknown'));
  end if;
end
$$;

-- Swipe chunks were rejected before this release, so historical mobile runs can
-- be safely assigned to touch while historical desktop runs are hardware.
update public.sessions
set input_method = case
  when device_class = 'mobile' then 'mobile_touch'
  when device_class = 'desktop' then 'hardware'
  else 'unknown'
end
where input_method = 'unknown';

drop index if exists public.idx_sessions_ranked_language_device_leaderboard;
create index idx_sessions_ranked_language_input_leaderboard
  on public.sessions(language, input_method, created_at desc, user_id)
  where mode = 'ranked' and risk_status = 'clear';

drop function if exists public.tr_get_ranked_leaderboard(timestamptz, text, text, integer);

create function public.tr_get_ranked_leaderboard(
  p_cutoff timestamptz,
  p_device_class text,
  p_language text default 'en',
  p_limit integer default 10,
  p_input_method text default 'unknown'
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
    and s.input_method = case
      when p_input_method in ('mobile_touch', 'mobile_swipe', 'hardware') then p_input_method
      when p_device_class = 'mobile' then 'mobile_touch'
      else 'hardware'
    end
    and s.language = p_language
    and s.created_at >= p_cutoff
  group by p.id, p.handle, p.rating
  order by p.rating desc, avg(s.net_wpm) desc, avg(s.accuracy) desc
  limit greatest(1, least(p_limit, 100));
$$;

drop function if exists public.tr_insert_session(
  uuid, text, text, integer, integer, integer, integer, double precision,
  double precision, double precision, double precision, integer, text, text,
  uuid, text, text, integer, integer, integer, integer, integer, jsonb, text[]
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
  p_input_method text default 'unknown',
  p_input_telemetry jsonb default '{}'::jsonb,
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
    xp_earned, risk_status, match_status, run_ticket_id, language, device_class,
    input_method, input_telemetry
  ) values (
    p_user_id, p_mode, p_passage_id, p_duration_ms, p_total_typed_chars, p_correct_chars,
    p_incorrect_chars, p_gross_wpm, p_net_wpm, p_accuracy, p_performance_score,
    p_xp_earned, p_risk_status, p_match_status, p_run_ticket_id, p_language, p_device_class,
    p_input_method, coalesce(p_input_telemetry, '{}'::jsonb)
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

drop function if exists public.tr_claim_ranked_pair(
  uuid, uuid, text, double precision, double precision, text
);

create function public.tr_claim_ranked_pair(
  p_session_id uuid,
  p_user_id uuid,
  p_passage_id text,
  p_current_rating double precision,
  p_rating_window double precision default 250,
  p_device_class text default 'unknown',
  p_input_method text default 'unknown'
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
declare
  opponent public.sessions;
  claimed_count integer;
  expected_input_method text;
begin
  expected_input_method := case
    when p_input_method in ('mobile_touch', 'mobile_swipe', 'hardware') then p_input_method
    when p_device_class = 'mobile' then 'mobile_touch'
    else 'hardware'
  end;

  update public.sessions
  set match_status = 'none'
  where mode = 'ranked'
    and match_status = 'pending'
    and created_at < now() - interval '24 hours';

  if not exists (
    select 1 from public.sessions current_run
    where current_run.id = p_session_id
      and current_run.user_id = p_user_id
      and current_run.mode = 'ranked'
      and current_run.input_method = expected_input_method
      and current_run.match_status = 'pending'
  ) then return; end if;

  select candidate.* into opponent
  from public.sessions candidate
  join public.players rival on rival.id = candidate.user_id
  where candidate.mode = 'ranked'
    and candidate.passage_id = p_passage_id
    and candidate.input_method = expected_input_method
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
  where id in (p_session_id, opponent.id)
    and input_method = expected_input_method
    and match_status = 'pending';
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

revoke all on function public.tr_get_ranked_leaderboard(timestamptz, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.tr_insert_session(
  uuid, text, text, integer, integer, integer, integer, double precision,
  double precision, double precision, double precision, integer, text, text,
  uuid, text, text, text, jsonb, integer, integer, integer, integer, integer, jsonb, text[]
) from public, anon, authenticated;
revoke all on function public.tr_claim_ranked_pair(uuid, uuid, text, double precision, double precision, text, text) from public, anon, authenticated;

grant execute on function public.tr_get_ranked_leaderboard(timestamptz, text, text, integer, text) to service_role;
grant execute on function public.tr_insert_session(
  uuid, text, text, integer, integer, integer, integer, double precision,
  double precision, double precision, double precision, integer, text, text,
  uuid, text, text, text, jsonb, integer, integer, integer, integer, integer, jsonb, text[]
) to service_role;
grant execute on function public.tr_claim_ranked_pair(uuid, uuid, text, double precision, double precision, text, text) to service_role;
