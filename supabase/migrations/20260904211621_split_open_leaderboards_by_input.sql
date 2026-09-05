create index if not exists idx_sessions_language_input_leaderboard_clear
  on public.sessions(language, input_method, created_at desc, user_id)
  where risk_status = 'clear';

drop function if exists public.tr_get_leaderboard(timestamptz, text, integer);

create function public.tr_get_leaderboard(
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
      when p_input_method in ('mobile_touch', 'mobile_swipe', 'hardware') then p_input_method
      else s.input_method
    end
    and s.created_at >= p_cutoff
  group by p.id, p.handle, p.rating
  order by avg(s.net_wpm) desc, avg(s.accuracy) desc
  limit greatest(1, least(p_limit, 100));
$$;

revoke all on function public.tr_get_leaderboard(timestamptz, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.tr_get_leaderboard(timestamptz, text, integer, text)
  to service_role;
