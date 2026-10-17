-- Compete: one board for XP levels, Call of the Day records and streaks.
-- Covers you, your connections and people you follow (blocked people never appear).
-- Read-only function. Safe to run more than once.

create or replace function public.game_board() returns jsonb
language sql stable security definer set search_path = public as $$
  with people as (
    select auth.uid() as id
    union
    select case when c.requester = auth.uid() then c.addressee else c.requester end
    from connections c where c.status = 'accepted' and auth.uid() in (c.requester, c.addressee)
    union
    select f.followee from follows f where f.follower = auth.uid()
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'user', mini_card(pe.id),
      'me', pe.id = auth.uid(),
      'xp', xp_of(pe.id),
      'calls', (select count(*) from daily_calls d where d.user_id = pe.id),
      'wins', (select count(*) from daily_calls d where d.user_id = pe.id and d.result = 'win'),
      'scored', (select count(*) from daily_calls d where d.user_id = pe.id and d.result in ('win', 'loss')),
      'month_wins', (select count(*) from daily_calls d where d.user_id = pe.id and d.result = 'win'
                     and d.day >= date_trunc('month', (now() at time zone 'America/New_York'))::date),
      'streak_weeks', streak_weeks(pe.id),
      'founding', is_founding(pe.id))), '[]'::jsonb)
  from people pe
  where pe.id is not null and exists (select 1 from profiles p where p.id = pe.id)
    and (pe.id = auth.uid() or not is_blocked_between(auth.uid(), pe.id));
$$;

revoke all on function public.game_board() from public, anon;
grant execute on function public.game_board() to authenticated;
