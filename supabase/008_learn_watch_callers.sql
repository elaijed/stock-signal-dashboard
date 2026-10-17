-- Learn (lessons + quizzes), weekly highlight card, copy a watchlist (+ pings when they add a stock),
-- top callers (+ pings when someone you follow makes a Call of the Day).
-- Only adds things. Safe to run more than once.

-- ---------- lessons ----------
create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null check (lesson_id ~ '^[a-z0-9\-]{1,60}$'),
  score int not null default 0 check (score between 0 and 100),
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
alter table public.lesson_progress enable row level security;
drop policy if exists "own lessons" on public.lesson_progress;
create policy "own lessons" on public.lesson_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- XP now also counts finished lessons (20 each)
create or replace function public.xp_of(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select (
      10 * (select count(*) from daily_calls where user_id = uid)
    + 15 * (select count(*) from daily_calls where user_id = uid and result = 'win')
    + 10 * (select count(*) from activity where user_id = uid and kind in ('post','poll','note'))
    +  5 * (select count(*) from activity where user_id = uid and kind in ('buy','sell'))
    +  2 * (select count(*) from activity_reactions r join activity a on a.id = r.activity_id where a.user_id = uid and r.user_id <> uid)
    +  3 * (select count(*) from activity_comments c join activity a on a.id = c.activity_id where a.user_id = uid and c.user_id <> uid)
    + 100 * qualified_invites(uid)
    + 20 * (select count(*) from lesson_progress where user_id = uid)
  )::int;
$$;

-- XP earned since a moment (for the weekly card)
create or replace function public.xp_since(uid uuid, since timestamptz) returns int
language sql stable security definer set search_path = public as $$
  select (
      10 * (select count(*) from daily_calls where user_id = uid and created_at >= since)
    + 15 * (select count(*) from daily_calls where user_id = uid and result = 'win' and created_at >= since)
    + 10 * (select count(*) from activity where user_id = uid and kind in ('post','poll','note') and created_at >= since)
    +  5 * (select count(*) from activity where user_id = uid and kind in ('buy','sell') and created_at >= since)
    +  2 * (select count(*) from activity_reactions r join activity a on a.id = r.activity_id where a.user_id = uid and r.user_id <> uid and r.created_at >= since)
    +  3 * (select count(*) from activity_comments c join activity a on a.id = c.activity_id where a.user_id = uid and c.user_id <> uid and c.created_at >= since)
    + 20 * (select count(*) from lesson_progress where user_id = uid and completed_at >= since)
  )::int;
$$;

-- ---------- weekly highlight ----------
-- This week (Monday 00:00 New York time until now): XP, calls, best call, streak, lessons, rank among friends.
create or replace function public.weekly_recap() returns jsonb
language sql stable security definer set search_path = public as $$
  with wk as (select (date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York') as since),
  people as (
    select auth.uid() as id
    union
    select case when c.requester = auth.uid() then c.addressee else c.requester end
    from connections c where c.status = 'accepted' and auth.uid() in (c.requester, c.addressee)
    union
    select f.followee from follows f where f.follower = auth.uid()
  ),
  scores as (
    select pe.id, xp_since(pe.id, (select since from wk)) as xp from people pe
    where pe.id is not null and exists (select 1 from profiles p where p.id = pe.id)
      and (pe.id = auth.uid() or not is_blocked_between(auth.uid(), pe.id))
  )
  select jsonb_build_object(
    'since', (select since from wk),
    'xp_week', (select xp from scores where id = auth.uid()),
    'xp_total', xp_of(auth.uid()),
    'calls', (select count(*) from daily_calls d where d.user_id = auth.uid() and d.created_at >= (select since from wk)),
    'wins', (select count(*) from daily_calls d where d.user_id = auth.uid() and d.result = 'win' and d.created_at >= (select since from wk)),
    'best_call', (select jsonb_build_object('symbol', d.symbol, 'direction', d.direction, 'day', d.day,
                    'move', round(((d.close - d.ref_close) / nullif(d.ref_close, 0) * 100)::numeric, 2))
                  from daily_calls d where d.user_id = auth.uid() and d.result = 'win' and d.created_at >= (select since from wk)
                  order by abs((d.close - d.ref_close) / nullif(d.ref_close, 0)) desc nulls last limit 1),
    'lessons', (select count(*) from lesson_progress l where l.user_id = auth.uid() and l.completed_at >= (select since from wk)),
    'streak_weeks', streak_weeks(auth.uid()),
    'rank', (select count(*) + 1 from scores s where s.xp > (select xp from scores where id = auth.uid())),
    'of', (select count(*) from scores),
    'top', (select coalesce(jsonb_agg(mini_card(s.id) || jsonb_build_object('xp', s.xp, 'me', s.id = auth.uid()) order by s.xp desc), '[]'::jsonb)
            from (select * from scores order by xp desc limit 3) s));
$$;

-- ---------- copy a watchlist ----------
create or replace function public.doc_symbols(doc jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct e ->> 'symbol'), '{}')
  from jsonb_array_elements(coalesce(case when jsonb_typeof(doc) = 'array' then doc else doc -> 'watchlist' end, '[]'::jsonb)) e
  where e ->> 'symbol' is not null;
$$;

-- can I see this person's list of stocks? (yourself, a connection, or a public account, and they share their watchlist)
create or replace function public.can_see_watchlist(uid uuid, viewer uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select uid = viewer or (
    not is_blocked_between(uid, viewer)
    and coalesce((share_of(uid) ->> 'watchlist')::boolean, true)
    and (is_connected(uid, viewer) or is_public_account(uid)));
$$;

create table if not exists public.watch_subs (
  subscriber uuid not null references auth.users(id) on delete cascade,
  target uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (subscriber, target),
  check (subscriber <> target)
);
alter table public.watch_subs enable row level security;
drop policy if exists "own subs" on public.watch_subs;
create policy "own subs" on public.watch_subs for select to authenticated using (subscriber = auth.uid());
drop policy if exists "subscribe" on public.watch_subs;
create policy "subscribe" on public.watch_subs for insert to authenticated
  with check (subscriber = auth.uid() and can_see_watchlist(target));
drop policy if exists "unsubscribe" on public.watch_subs;
create policy "unsubscribe" on public.watch_subs for delete to authenticated using (subscriber = auth.uid());

-- symbols only, never amounts
create or replace function public.watchlist_of(uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when can_see_watchlist(uid) then (
    select jsonb_build_object('symbols', to_jsonb(doc_symbols(p.watchlist)),
      'subscribed', exists (select 1 from watch_subs w where w.subscriber = auth.uid() and w.target = uid))
    from portfolios p where p.user_id = uid)
  else null end;
$$;

-- ping subscribers when someone adds stocks to their list
create or replace function public.trg_watch_add_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare added text[];
begin
  select coalesce(array_agg(s), '{}') into added
  from unnest(doc_symbols(new.watchlist)) s where not (s = any(doc_symbols(old.watchlist)));
  if cardinality(added) = 0 then return new; end if;
  insert into notifications (user_id, actor, kind, data)
  select w.subscriber, new.user_id, 'watch_add', jsonb_build_object('symbols', to_jsonb(added[1:5]))
  from watch_subs w where w.target = new.user_id and can_see_watchlist(new.user_id, w.subscriber);
  return new;
end $$;
drop trigger if exists watch_add_notify on public.portfolios;
create trigger watch_add_notify after update of watchlist on public.portfolios
  for each row when (old.watchlist is distinct from new.watchlist) execute function public.trg_watch_add_notify();

-- ---------- top callers ----------
-- Best Call of the Day records among public accounts and your connections (at least 3 scored calls).
create or replace function public.top_callers() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.score desc, t.wins desc), '[]'::jsonb) from (
    select mini_card(d.user_id) as "user", d.user_id = auth.uid() as me,
      count(*) filter (where d.result in ('win', 'loss')) as scored,
      count(*) filter (where d.result = 'win') as wins,
      count(*) as calls,
      count(*) filter (where d.result = 'win' and d.day >= date_trunc('month', now() at time zone 'America/New_York')::date) as month_wins,
      -- hit rate pulled toward 50% for small samples, so 3/3 doesn't beat 40/50
      round(((count(*) filter (where d.result = 'win') + 5)::numeric / (count(*) filter (where d.result in ('win', 'loss')) + 10)) * 100, 1) as score,
      is_public_account(d.user_id) as public,
      exists (select 1 from follows f where f.follower = auth.uid() and f.followee = d.user_id) as i_follow,
      is_founding(d.user_id) as founding,
      streak_weeks(d.user_id) as streak
    from daily_calls d
    where d.user_id = auth.uid() or ((is_public_account(d.user_id) or is_connected(d.user_id, auth.uid())) and not is_blocked_between(d.user_id, auth.uid()))
    group by d.user_id
    having count(*) filter (where d.result in ('win', 'loss')) >= 3 or d.user_id = auth.uid()
    order by score desc
    limit 50) t;
$$;

-- ping followers when someone they follow makes a call
create or replace function public.trg_call_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor, kind, data)
  select f.follower, new.user_id, 'new_call', jsonb_build_object('symbol', new.symbol, 'direction', new.direction, 'day', new.day)
  from follows f where f.followee = new.user_id and not is_blocked_between(f.follower, new.user_id);
  return new;
end $$;
drop trigger if exists call_notify on public.daily_calls;
create trigger call_notify after insert on public.daily_calls for each row execute function public.trg_call_notify();

-- ---------- grants ----------
revoke all on function public.xp_since(uuid, timestamptz), public.weekly_recap(), public.can_see_watchlist(uuid, uuid),
  public.watchlist_of(uuid), public.top_callers() from public, anon;
grant execute on function public.xp_since(uuid, timestamptz), public.weekly_recap(), public.can_see_watchlist(uuid, uuid),
  public.watchlist_of(uuid), public.top_callers() to authenticated;
