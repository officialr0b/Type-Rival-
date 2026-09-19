-- Add a user-selected stenography lane. Browsers see translated text from
-- Plover/CAT software rather than raw strokes, so this preference is bound to
-- the one-use run ticket before the race starts.

alter table public.run_tickets
  add column if not exists input_preference text not null default 'tap';

alter table public.run_tickets
  drop constraint if exists run_tickets_input_preference_check,
  add constraint run_tickets_input_preference_check
    check (input_preference in ('tap', 'swipe', 'steno'));

alter table public.sessions
  drop constraint if exists sessions_input_method_check,
  add constraint sessions_input_method_check
    check (input_method in ('mobile_touch', 'mobile_swipe', 'hardware', 'stenography', 'unknown'));

create or replace function public.tr_get_leaderboard(
  p_cutoff timestamptz,
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
  where s.risk_status = 'clear'
    and s.language = p_language
    and s.input_method = case
      when p_input_method in ('mobile_touch', 'mobile_swipe', 'hardware', 'stenography') then p_input_method
      else s.input_method
    end
    and s.created_at >= p_cutoff
  group by p.id, p.handle, p.rating
  order by avg(s.net_wpm) desc, avg(s.accuracy) desc
  limit greatest(1, least(p_limit, 100));
$$;

create or replace function public.tr_get_ranked_leaderboard(
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
      when p_input_method in ('mobile_touch', 'mobile_swipe', 'hardware', 'stenography') then p_input_method
      when p_device_class = 'mobile' then 'mobile_touch'
      else 'hardware'
    end
    and s.language = p_language
    and s.created_at >= p_cutoff
  group by p.id, p.handle, p.rating
  order by p.rating desc, avg(s.net_wpm) desc, avg(s.accuracy) desc
  limit greatest(1, least(p_limit, 100));
$$;

create or replace function public.tr_claim_ranked_pair(
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
    when p_input_method in ('mobile_touch', 'mobile_swipe', 'hardware', 'stenography') then p_input_method
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
declare
  inserted public.sessions;
  ticket public.run_tickets;
begin
  select * into ticket
  from public.run_tickets
  where id = p_run_ticket_id
  for update;

  if ticket.id is null or ticket.user_id <> p_user_id then
    raise exception using errcode = '22023', message = 'invalid_run_ticket';
  end if;

  select * into inserted
  from public.sessions
  where run_ticket_id = p_run_ticket_id;

  if inserted.id is not null then
    if inserted.user_id is distinct from p_user_id
      or inserted.mode is distinct from p_mode
      or inserted.passage_id is distinct from p_passage_id
      or inserted.duration_ms is distinct from p_duration_ms
      or inserted.total_typed_chars is distinct from p_total_typed_chars
      or inserted.correct_chars is distinct from p_correct_chars
      or inserted.incorrect_chars is distinct from p_incorrect_chars
      or inserted.language is distinct from p_language
      or inserted.device_class is distinct from p_device_class
      or inserted.input_method is distinct from p_input_method then
      raise exception using errcode = '22023', message = 'run_ticket_replay_mismatch';
    end if;
    return inserted;
  end if;

  if ticket.started_at is null
    or (ticket.consumed_at is not null and ticket.consumed_at < now() - interval '2 minutes')
    or ticket.expires_at <= now()
    or ticket.mode is distinct from p_mode
    or ticket.passage_id is distinct from p_passage_id
    or ticket.language is distinct from p_language
    or ticket.device_class is distinct from p_device_class
    or ((ticket.input_preference = 'steno') is distinct from (p_input_method = 'stenography'))
    or p_duration_ms > ticket.duration_sec * 1000 + 1500 then
    raise exception using errcode = '22023', message = 'invalid_or_expired_run_ticket';
  end if;

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

  update public.run_tickets
  set consumed_at = now()
  where id = p_run_ticket_id;

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

revoke all on function public.tr_get_leaderboard(timestamptz, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.tr_get_ranked_leaderboard(timestamptz, text, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.tr_claim_ranked_pair(uuid, uuid, text, double precision, double precision, text, text)
  from public, anon, authenticated;
revoke all on function public.tr_insert_session(
  uuid, text, text, integer, integer, integer, integer, double precision,
  double precision, double precision, double precision, integer, text, text,
  uuid, text, text, text, jsonb, integer, integer, integer, integer, integer,
  jsonb, text[]
) from public, anon, authenticated;

grant execute on function public.tr_get_leaderboard(timestamptz, text, integer, text)
  to service_role;
grant execute on function public.tr_get_ranked_leaderboard(timestamptz, text, text, integer, text)
  to service_role;
grant execute on function public.tr_claim_ranked_pair(uuid, uuid, text, double precision, double precision, text, text)
  to service_role;
grant execute on function public.tr_insert_session(
  uuid, text, text, integer, integer, integer, integer, double precision,
  double precision, double precision, double precision, integer, text, text,
  uuid, text, text, text, jsonb, integer, integer, integer, integer, integer,
  jsonb, text[]
) to service_role;
