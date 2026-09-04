create table public.mission_claims (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.players(id) on delete cascade,
  mission_key text not null check (
    mission_key in ('daily-clean-hands', 'daily-field-study', 'weekly-open-challenge')
  ),
  period_start date not null,
  xp_reward integer not null check (xp_reward between 1 and 500),
  claimed_at timestamptz not null default now(),
  unique (user_id, mission_key, period_start)
);

alter table public.mission_claims enable row level security;
revoke all on public.mission_claims from public, anon, authenticated;
grant select, insert, delete on public.mission_claims to service_role;

create function public.tr_claim_mission(
  p_user_id uuid,
  p_mission_key text,
  p_period_start date
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_reward integer;
  awarded integer;
begin
  expected_reward := case p_mission_key
    when 'daily-clean-hands' then 40
    when 'daily-field-study' then 30
    when 'weekly-open-challenge' then 75
    else null
  end;

  if expected_reward is null then
    raise exception 'Unknown mission key';
  end if;

  insert into public.mission_claims (user_id, mission_key, period_start, xp_reward)
  values (p_user_id, p_mission_key, p_period_start, expected_reward)
  on conflict (user_id, mission_key, period_start) do nothing
  returning xp_reward into awarded;

  if awarded is null then
    return 0;
  end if;

  update public.players
  set xp = xp + awarded, updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Player not found';
  end if;

  return awarded;
end;
$$;

revoke all on function public.tr_claim_mission(uuid, text, date) from public, anon, authenticated;
grant execute on function public.tr_claim_mission(uuid, text, date) to service_role;
