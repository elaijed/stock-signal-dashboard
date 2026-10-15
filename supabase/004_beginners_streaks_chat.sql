-- Weekly streaks (check-ins), practice-portfolio leaderboard, group challenges,
-- live group chat (realtime + calmer notifications) and sharing a stock.

-- ---------- weekly check-ins count toward streaks (never shown in feeds) ----------
alter table public.activity drop constraint if exists activity_kind_check;
alter table public.activity add constraint activity_kind_check
  check (kind in ('buy','sell','watch','target','stop','note','poll','challenge','checkin'));

-- consecutive ISO weeks (ending this week or last week) with any activity
create or replace function public.streak_weeks(uid uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare wk date := date_trunc('week', now())::date; n int := 0;
begin
  if not exists (select 1 from activity where user_id = uid and created_at >= wk) then
    wk := wk - 7;   -- this week not done yet: the streak can still continue from last week
  end if;
  loop
    exit when not exists (select 1 from activity where user_id = uid and created_at >= wk and created_at < wk + 7);
    n := n + 1;
    wk := wk - 7;
    exit when n > 520;
  end loop;
  return n;
end $$;

create or replace function public.badges(uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when uid = auth.uid() or is_connected(uid, auth.uid()) or coalesce((select searchable from profiles where id = uid), false)
  then jsonb_build_object(
    'notes', (select count(*) from activity where user_id = uid and note is not null and note <> ''),
    'targets', (select count(*) from activity where user_id = uid and kind = 'target'),
    'wins', (select count(*) from activity where user_id = uid and kind = 'sell' and (data ->> 'gainPct')::numeric > 0),
    'trades', (select count(*) from activity where user_id = uid and kind in ('buy','sell')),
    'polls', (select count(*) from activity where user_id = uid and kind = 'poll'),
    'challenges', (select count(*) from challenge_entries where user_id = uid),
    'connections', (select count(*) from connections c where c.status = 'accepted' and uid in (c.requester, c.addressee)),
    'streak', streak_weeks(uid),
    'member_since', (select created_at from profiles where id = uid))
  else null end;
$$;

-- ---------- practice (paper) portfolio leaderboard ----------
-- Practice money is fake, so cash and share counts are fine to show to connections who opted in.
create or replace function public.practice_leaderboard() returns jsonb
language sql stable security definer set search_path = public as $$
  with people as (
    select auth.uid() as id
    union
    select case when c.requester = auth.uid() then c.addressee else c.requester end
    from connections c where c.status = 'accepted' and auth.uid() in (c.requester, c.addressee)
  )
  select coalesce(jsonb_agg(jsonb_build_object('user', mini_card(pe.id), 'me', pe.id = auth.uid(),
      'paper', p.watchlist -> 'paper')), '[]'::jsonb)
  from people pe join portfolios p on p.user_id = pe.id
  where jsonb_typeof(p.watchlist -> 'paper') = 'object'
    and (pe.id = auth.uid() or (coalesce((share_of(pe.id) ->> 'leaderboard')::boolean, false)
                                and not is_blocked_between(auth.uid(), pe.id)));
$$;

-- ---------- group challenge: this month's entries of the group's members ----------
create or replace function public.group_challenge_board(gid bigint, m text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_group_member(gid) then coalesce((
    select jsonb_agg(jsonb_build_object('user', mini_card(e.user_id), 'me', e.user_id = auth.uid(),
        'symbols', e.symbols, 'start_prices', e.start_prices))
    from challenge_entries e join group_members gm on gm.user_id = e.user_id and gm.group_id = gid
    where e.month = m), '[]'::jsonb) else null end;
$$;

-- ---------- group chat: realtime + one unread notification per group at a time ----------
do $$ begin
  alter publication supabase_realtime add table public.group_posts;
exception when duplicate_object then null; when undefined_object then null;
end $$;

create or replace function public.trg_group_post_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor, kind, group_id, data)
  select m.user_id, new.user_id, 'group_post', new.group_id,
         jsonb_build_object('name', (select name from groups where id = new.group_id), 'body', left(new.body, 80))
  from group_members m
  where m.group_id = new.group_id and m.user_id <> new.user_id
    -- don't stack: skip members who already have an unread message notification for this group
    and not exists (select 1 from notifications n where n.user_id = m.user_id and n.group_id = new.group_id
                    and n.kind = 'group_post' and n.read_at is null);
  return new;
end $$;

-- ---------- share a stock with a connection ----------
create or replace function public.share_stock(target uuid, sym text, note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_connected(auth.uid(), target) or is_blocked_between(auth.uid(), target) then
    raise exception 'You can only share with your connections.';
  end if;
  if sym !~ '^[A-Z0-9.\-]{1,12}$' then raise exception 'Invalid ticker.'; end if;
  if (select count(*) from notifications where actor = auth.uid() and kind = 'share' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Sharing limit reached — try again later.';
  end if;
  perform notify(target, auth.uid(), 'share', null, null, jsonb_build_object('symbol', sym, 'note', left(coalesce(note, ''), 200)));
end $$;

revoke all on function public.streak_weeks(uuid), public.practice_leaderboard(), public.group_challenge_board(bigint, text),
  public.share_stock(uuid, text, text) from public, anon;
grant execute on function public.streak_weeks(uuid), public.practice_leaderboard(), public.group_challenge_board(bigint, text),
  public.share_stock(uuid, text, text) to authenticated;
