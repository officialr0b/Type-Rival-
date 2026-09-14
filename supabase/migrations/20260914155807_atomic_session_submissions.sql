-- Make a saved run and its one-use run ticket commit together. Replaying the
-- same ticket returns the original session without awarding XP twice.
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
    or ticket.consumed_at is not null
    or ticket.expires_at <= now()
    or ticket.mode is distinct from p_mode
    or ticket.passage_id is distinct from p_passage_id
    or ticket.language is distinct from p_language
    or ticket.device_class is distinct from p_device_class
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

revoke all on function public.tr_insert_session(
  uuid, text, text, integer, integer, integer, integer, double precision,
  double precision, double precision, double precision, integer, text, text,
  uuid, text, text, text, jsonb, integer, integer, integer, integer, integer,
  jsonb, text[]
) from public, anon, authenticated;

grant execute on function public.tr_insert_session(
  uuid, text, text, integer, integer, integer, integer, double precision,
  double precision, double precision, double precision, integer, text, text,
  uuid, text, text, text, jsonb, integer, integer, integer, integer, integer,
  jsonb, text[]
) to service_role;
