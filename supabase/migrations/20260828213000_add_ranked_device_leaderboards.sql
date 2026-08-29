alter table public.run_tickets
  add column if not exists device_class text not null default 'unknown'
    check (device_class in ('mobile', 'desktop', 'unknown'));

alter table public.sessions
  add column if not exists device_class text not null default 'unknown'
    check (device_class in ('mobile', 'desktop', 'unknown'));

create index if not exists idx_sessions_ranked_device_leaderboard
  on public.sessions(device_class, created_at desc, user_id)
  where mode = 'ranked' and risk_status = 'clear';

drop function if exists public.tr_insert_session(
  uuid, text, text, integer, integer, integer, integer, double precision,
  double precision, double precision, double precision, integer, text, text, uuid
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
  p_run_ticket_id uuid,
  p_device_class text default 'unknown'
) returns public.sessions
language plpgsql security definer set search_path = ''
as $$
declare inserted public.sessions;
begin
  insert into public.sessions (
    user_id, mode, passage_id, duration_ms, total_typed_chars, correct_chars,
    incorrect_chars, gross_wpm, net_wpm, accuracy, performance_score,
    xp_earned, risk_status, match_status, run_ticket_id, device_class
  ) values (
    p_user_id, p_mode, p_passage_id, p_duration_ms, p_total_typed_chars, p_correct_chars,
    p_incorrect_chars, p_gross_wpm, p_net_wpm, p_accuracy, p_performance_score,
    p_xp_earned, p_risk_status, p_match_status, p_run_ticket_id, p_device_class
  ) returning * into inserted;

  update public.players
  set xp = xp + p_xp_earned, updated_at = now()
  where id = p_user_id;
  return inserted;
end;
$$;

drop function if exists public.tr_claim_ranked_pair(
  uuid, uuid, text, double precision, double precision
);

create or replace function public.tr_claim_ranked_pair(
  p_session_id uuid,
  p_user_id uuid,
  p_passage_id text,
  p_current_rating double precision,
  p_rating_window double precision default 250,
  p_device_class text default 'unknown'
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

  if not exists (
    select 1 from public.sessions current_run
    where current_run.id = p_session_id
      and current_run.user_id = p_user_id
      and current_run.mode = 'ranked'
      and current_run.device_class = p_device_class
      and current_run.match_status = 'pending'
  ) then return; end if;

  select candidate.* into opponent
  from public.sessions candidate
  join public.players rival on rival.id = candidate.user_id
  where candidate.mode = 'ranked'
    and candidate.passage_id = p_passage_id
    and candidate.device_class = p_device_class
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
    and device_class = p_device_class
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

create or replace function public.tr_get_ranked_leaderboard(
  p_cutoff timestamptz,
  p_device_class text,
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
    and s.created_at >= p_cutoff
  group by p.id, p.handle, p.rating
  order by p.rating desc, avg(s.net_wpm) desc, avg(s.accuracy) desc
  limit greatest(1, least(p_limit, 100));
$$;

revoke all on function public.tr_insert_session(uuid, text, text, integer, integer, integer, integer, double precision, double precision, double precision, double precision, integer, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.tr_claim_ranked_pair(uuid, uuid, text, double precision, double precision, text) from public, anon, authenticated;
revoke all on function public.tr_get_ranked_leaderboard(timestamptz, text, integer) from public, anon, authenticated;

grant execute on function public.tr_insert_session(uuid, text, text, integer, integer, integer, integer, double precision, double precision, double precision, double precision, integer, text, text, uuid, text) to service_role;
grant execute on function public.tr_claim_ranked_pair(uuid, uuid, text, double precision, double precision, text) to service_role;
grant execute on function public.tr_get_ranked_leaderboard(timestamptz, text, integer) to service_role;
