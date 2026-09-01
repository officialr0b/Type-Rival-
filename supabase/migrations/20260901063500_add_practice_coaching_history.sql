create table public.practice_coaching_runs (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  user_id uuid not null references public.players(id) on delete cascade,
  passage_id text not null,
  total_typed_chars integer not null check (total_typed_chars >= 0 and total_typed_chars <= 2000),
  correct_chars integer not null check (correct_chars >= 0 and correct_chars <= 2000),
  incorrect_chars integer not null check (incorrect_chars >= 0 and incorrect_chars <= 2000),
  gross_wpm double precision not null check (gross_wpm >= 0),
  net_wpm double precision not null check (net_wpm >= 0),
  accuracy double precision not null check (accuracy >= 0 and accuracy <= 100),
  performance_score double precision not null check (performance_score >= 0),
  corrections integer not null default 0 check (corrections >= 0 and corrections <= 2000),
  first_try_errors integer not null default 0 check (first_try_errors >= 0 and first_try_errors <= 2000),
  pause_count integer not null default 0 check (pause_count >= 0 and pause_count <= 2000),
  longest_pause_ms integer not null default 0 check (longest_pause_ms >= 0 and longest_pause_ms <= 120000),
  longest_pause_index integer check (longest_pause_index is null or (longest_pause_index >= 0 and longest_pause_index <= 2000)),
  mistakes jsonb not null default '[]'::jsonb check (
    octet_length(mistakes::text) <= 12000
    and case when jsonb_typeof(mistakes) = 'array' then jsonb_array_length(mistakes) <= 24 else false end
  ),
  insight_keys text[] not null default '{}'::text[] check (
    cardinality(insight_keys) <= 6
    and octet_length(array_to_string(insight_keys, '')) <= 1024
  ),
  check (correct_chars + incorrect_chars <= total_typed_chars),
  created_at timestamptz not null default now()
);

create index practice_coaching_runs_user_created_idx
  on public.practice_coaching_runs(user_id, created_at desc);

alter table public.practice_coaching_runs enable row level security;

revoke all on public.practice_coaching_runs from public, anon, authenticated;
grant select, insert, update, delete on public.practice_coaching_runs to service_role;

drop function if exists public.tr_insert_session(
  uuid, text, text, integer, integer, integer, integer, double precision,
  double precision, double precision, double precision, integer, text, text,
  uuid, text
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
    xp_earned, risk_status, match_status, run_ticket_id, device_class
  ) values (
    p_user_id, p_mode, p_passage_id, p_duration_ms, p_total_typed_chars, p_correct_chars,
    p_incorrect_chars, p_gross_wpm, p_net_wpm, p_accuracy, p_performance_score,
    p_xp_earned, p_risk_status, p_match_status, p_run_ticket_id, p_device_class
  ) returning * into inserted;

  if p_mode = 'practice' then
    insert into public.practice_coaching_runs (
      session_id, user_id, passage_id, total_typed_chars, correct_chars, incorrect_chars,
      gross_wpm, net_wpm, accuracy, performance_score, corrections,
      first_try_errors, pause_count, longest_pause_ms, longest_pause_index,
      mistakes, insight_keys, created_at
    ) values (
      inserted.id, p_user_id, p_passage_id, p_total_typed_chars, p_correct_chars, p_incorrect_chars,
      p_gross_wpm, p_net_wpm, p_accuracy, p_performance_score,
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
  uuid, text, integer, integer, integer, integer, integer, jsonb, text[]
) from public, anon, authenticated;

grant execute on function public.tr_insert_session(
  uuid, text, text, integer, integer, integer, integer, double precision,
  double precision, double precision, double precision, integer, text, text,
  uuid, text, integer, integer, integer, integer, integer, jsonb, text[]
) to service_role;
