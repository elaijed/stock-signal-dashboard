-- Social v2: activity feed, notes, reactions, comments, polls, notifications,
-- challenges, leaderboard, badges, invite links, groups.
-- Same privacy model as 001: you only touch your own rows directly; anything
-- about other people comes through SECURITY DEFINER functions that check the
-- relationship and the owner's share settings.

-- ---------- profile additions ----------
alter table public.profiles add column if not exists invite_code text unique;
update public.profiles set invite_code = substr(md5(random()::text || id::text), 1, 10) where invite_code is null;
alter table public.profiles alter column invite_code set default substr(md5(random()::text), 1, 10);

-- ---------- helpers ----------
create or replace function public.is_connected(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from connections c where c.status = 'accepted'
    and ((c.requester = a and c.addressee = b) or (c.requester = b and c.addressee = a)));
$$;

create or replace function public.share_of(uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select '{"holdings":true,"dollars":true,"unrealized":true,"realized":true,"watchlist":true,"sectors":true,"alerts":false,"activity":true,"leaderboard":false}'::jsonb
         || coalesce((select share from profiles where id = uid), '{}'::jsonb);
$$;

create or replace function public.mini_card(uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'username', p.username, 'full_name', p.full_name, 'avatar_url', p.avatar_url)
  from profiles p where p.id = uid;
$$;

-- ---------- activity ----------
create table if not exists public.activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('buy','sell','watch','target','stop','note','poll','challenge')),
  symbol text check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  data jsonb not null default '{}'::jsonb,
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now()
);
create index if not exists activity_user_time on public.activity (user_id, created_at desc);
create index if not exists activity_symbol on public.activity (symbol);
alter table public.activity enable row level security;
drop policy if exists "own activity" on public.activity;
create policy "own activity" on public.activity
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- may the current user see this activity row (respecting the owner's share settings)?
create or replace function public.activity_allowed(a activity, viewer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a.user_id = viewer or (
    is_connected(a.user_id, viewer)
    and not is_blocked_between(a.user_id, viewer)
    and coalesce((share_of(a.user_id) ->> 'activity')::boolean, true)
    and case
      when a.kind in ('buy','sell','target','stop') then coalesce((share_of(a.user_id) ->> 'holdings')::boolean, true)
      when a.kind = 'watch' then coalesce((share_of(a.user_id) ->> 'watchlist')::boolean, true)
      else true end);
$$;

create or replace function public.can_see_activity(aid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select activity_allowed(a, auth.uid()) from activity a where a.id = aid), false);
$$;

-- strip dollar / realized fields the owner doesn't share
create or replace function public.activity_data_for(a activity, viewer uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d jsonb := a.data; s jsonb;
begin
  if a.user_id = viewer then return d; end if;
  s := share_of(a.user_id);
  if not coalesce((s ->> 'dollars')::boolean, true) then d := d - 'qty' - 'gainUsd' - 'value'; end if;
  if a.kind = 'sell' and not coalesce((s ->> 'realized')::boolean, true) then d := d - 'gainPct' - 'gainUsd' - 'sellPrice'; end if;
  return d;
end $$;

-- ---------- reactions / comments / poll votes ----------
create table if not exists public.activity_reactions (
  activity_id bigint not null references public.activity(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍','🔥','🤔','💡')),
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id, emoji)
);
alter table public.activity_reactions enable row level security;
drop policy if exists "react" on public.activity_reactions;
create policy "react" on public.activity_reactions for insert to authenticated
  with check (user_id = auth.uid() and can_see_activity(activity_id));
drop policy if exists "unreact" on public.activity_reactions;
create policy "unreact" on public.activity_reactions for delete to authenticated using (user_id = auth.uid());
drop policy if exists "see own reactions" on public.activity_reactions;
create policy "see own reactions" on public.activity_reactions for select to authenticated using (user_id = auth.uid());

create table if not exists public.activity_comments (
  id bigint generated always as identity primary key,
  activity_id bigint not null references public.activity(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists comments_activity on public.activity_comments (activity_id, created_at);
alter table public.activity_comments enable row level security;
drop policy if exists "comment" on public.activity_comments;
create policy "comment" on public.activity_comments for insert to authenticated
  with check (user_id = auth.uid() and can_see_activity(activity_id));
drop policy if exists "delete comment" on public.activity_comments;
create policy "delete comment" on public.activity_comments for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from activity a where a.id = activity_id and a.user_id = auth.uid()));
drop policy if exists "see own comments" on public.activity_comments;
create policy "see own comments" on public.activity_comments for select to authenticated using (user_id = auth.uid());

create table if not exists public.poll_votes (
  activity_id bigint not null references public.activity(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  choice text not null check (choice in ('bull','bear')),
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);
alter table public.poll_votes enable row level security;
drop policy if exists "vote" on public.poll_votes;
create policy "vote" on public.poll_votes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and can_see_activity(activity_id)
              and exists (select 1 from activity a where a.id = activity_id and a.kind = 'poll'));

-- ---------- notifications ----------
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor uuid references auth.users(id) on delete cascade,
  kind text not null,
  activity_id bigint references public.activity(id) on delete cascade,
  group_id bigint,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "read notifications" on public.notifications;
create policy "read notifications" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "clear notifications" on public.notifications;
create policy "clear notifications" on public.notifications for delete to authenticated using (user_id = auth.uid());

create or replace function public.notify(target uuid, actor uuid, kind text, aid bigint, gid bigint, data jsonb)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, actor, kind, activity_id, group_id, data)
  select target, actor, kind, aid, gid, coalesce(data, '{}'::jsonb) where target is not null and target <> actor;
$$;

create or replace function public.trg_notify_connection() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform notify(new.addressee, new.requester, 'request', null, null, jsonb_build_object('note', new.note));
  elsif tg_op = 'INSERT' and new.status = 'accepted' then
    perform notify(new.addressee, new.requester, 'accepted', null, null, null);
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending' then
    perform notify(new.requester, new.addressee, 'accepted', null, null, null);
    delete from notifications where user_id = new.addressee and actor = new.requester and kind = 'request';
  end if;
  return new;
end $$;
drop trigger if exists connection_notify on public.connections;
create trigger connection_notify after insert or update on public.connections
  for each row execute function public.trg_notify_connection();

create or replace function public.trg_notify_activity_child() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; sym text;
begin
  select user_id, symbol into owner, sym from activity where id = new.activity_id;
  if tg_table_name = 'activity_reactions' then
    perform notify(owner, new.user_id, 'reaction', new.activity_id, null, jsonb_build_object('emoji', new.emoji, 'symbol', sym));
  elsif tg_table_name = 'activity_comments' then
    perform notify(owner, new.user_id, 'comment', new.activity_id, null, jsonb_build_object('body', left(new.body, 80), 'symbol', sym));
    -- also tell earlier commenters on the same post
    insert into notifications (user_id, actor, kind, activity_id, data)
    select distinct c.user_id, new.user_id, 'reply', new.activity_id, jsonb_build_object('body', left(new.body, 80), 'symbol', sym)
    from activity_comments c where c.activity_id = new.activity_id and c.user_id not in (new.user_id, owner);
  elsif tg_table_name = 'poll_votes' then
    perform notify(owner, new.user_id, 'vote', new.activity_id, null, jsonb_build_object('choice', new.choice, 'symbol', sym));
  end if;
  return new;
end $$;
drop trigger if exists reaction_notify on public.activity_reactions;
create trigger reaction_notify after insert on public.activity_reactions for each row execute function public.trg_notify_activity_child();
drop trigger if exists comment_notify on public.activity_comments;
create trigger comment_notify after insert on public.activity_comments for each row execute function public.trg_notify_activity_child();
drop trigger if exists vote_notify on public.poll_votes;
create trigger vote_notify after insert on public.poll_votes for each row execute function public.trg_notify_activity_child();

-- ---------- feed ----------
-- Items from you + your connections (filtered), newest first.
-- Optional filters: one person (only_user) or one stock (only_symbol). Page with before_id.
create or replace function public.get_feed(before_id bigint default null, lim int default 30,
                                          only_user uuid default null, only_symbol text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  items as (
    select a.* from activity a, me
    where (before_id is null or a.id < before_id)
      and (only_user is null or a.user_id = only_user)
      and (only_symbol is null or a.symbol = upper(only_symbol))
      and (a.user_id = me.uid or is_connected(a.user_id, me.uid))
      and activity_allowed(a, me.uid)
    order by a.id desc
    limit least(greatest(coalesce(lim, 30), 1), 100)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'kind', i.kind, 'symbol', i.symbol, 'note', i.note, 'created_at', i.created_at,
      'data', activity_data_for(i, (select uid from me)),
      'author', mini_card(i.user_id),
      'mine', i.user_id = (select uid from me),
      'reactions', coalesce((select jsonb_object_agg(r.emoji, r.n) from (
          select emoji, count(*) n from activity_reactions where activity_id = i.id group by emoji) r), '{}'::jsonb),
      'my_reactions', coalesce((select jsonb_agg(emoji) from activity_reactions where activity_id = i.id and user_id = (select uid from me)), '[]'::jsonb),
      'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at,
                    'author', mini_card(c.user_id), 'mine', c.user_id = (select uid from me)) order by c.created_at)
                  from activity_comments c where c.activity_id = i.id), '[]'::jsonb),
      'poll', case when i.kind = 'poll' then jsonb_build_object(
          'bull', (select count(*) from poll_votes v where v.activity_id = i.id and v.choice = 'bull'),
          'bear', (select count(*) from poll_votes v where v.activity_id = i.id and v.choice = 'bear'),
          'mine', (select choice from poll_votes v where v.activity_id = i.id and v.user_id = (select uid from me))) end
    ) order by i.id desc), '[]'::jsonb)
  from items i;
$$;

-- ---------- network symbols (friends who own / watch) ----------
create or replace function public.network_symbols() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user', mini_card(f.id),
    'owned', case when coalesce((share_of(f.id) ->> 'holdings')::boolean, true) then coalesce((
        select jsonb_agg(e ->> 'symbol') from jsonb_array_elements(
          coalesce(case when jsonb_typeof(p.watchlist) = 'array' then p.watchlist else p.watchlist -> 'watchlist' end, '[]')) e
        where e ->> 'status' = 'owned'), '[]'::jsonb) else '[]'::jsonb end,
    'watching', case when coalesce((share_of(f.id) ->> 'watchlist')::boolean, true) then coalesce((
        select jsonb_agg(e ->> 'symbol') from jsonb_array_elements(
          coalesce(case when jsonb_typeof(p.watchlist) = 'array' then p.watchlist else p.watchlist -> 'watchlist' end, '[]')) e
        where coalesce(e ->> 'status', '') <> 'owned'), '[]'::jsonb) else '[]'::jsonb end)), '[]'::jsonb)
  from (select case when c.requester = auth.uid() then c.addressee else c.requester end as id
        from connections c where c.status = 'accepted' and auth.uid() in (c.requester, c.addressee)) f
  left join portfolios p on p.user_id = f.id
  where not is_blocked_between(auth.uid(), f.id);
$$;

-- ---------- leaderboard (opt-in, percentages only) ----------
-- Positions come back as weights (share of cost basis), never share counts or dollars.
create or replace function public.leaderboard() returns jsonb
language sql stable security definer set search_path = public as $$
  with people as (
    select auth.uid() as id
    union
    select case when c.requester = auth.uid() then c.addressee else c.requester end
    from connections c where c.status = 'accepted' and auth.uid() in (c.requester, c.addressee)
  ), pos as (
    select pe.id, e ->> 'symbol' as symbol, (e ->> 'buyPrice')::numeric as bp, (e ->> 'qty')::numeric * (e ->> 'buyPrice')::numeric as cost
    from people pe join portfolios p on p.user_id = pe.id,
    jsonb_array_elements(coalesce(case when jsonb_typeof(p.watchlist) = 'array' then p.watchlist else p.watchlist -> 'watchlist' end, '[]')) e
    where e ->> 'status' = 'owned' and (e ->> 'buyPrice')::numeric > 0 and (e ->> 'qty')::numeric > 0
  ), tot as (select id, sum(cost) as t from pos group by id)
  select coalesce(jsonb_agg(jsonb_build_object('user', mini_card(pe.id), 'me', pe.id = auth.uid(),
    'positions', (select coalesce(jsonb_agg(jsonb_build_object('symbol', pos.symbol, 'buyPrice', pos.bp,
        'weight', pos.cost / nullif(tot.t, 0))), '[]'::jsonb)
      from pos join tot on tot.id = pos.id where pos.id = pe.id))), '[]'::jsonb)
  from people pe
  where pe.id = auth.uid() or (coalesce((share_of(pe.id) ->> 'leaderboard')::boolean, false)
                               and coalesce((share_of(pe.id) ->> 'holdings')::boolean, true)
                               and not is_blocked_between(auth.uid(), pe.id));
$$;

-- ---------- monthly pick challenge ----------
create table if not exists public.challenge_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  symbols text[] not null check (cardinality(symbols) between 1 and 3),
  start_prices numeric[] not null,
  created_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.challenge_entries enable row level security;
drop policy if exists "own entries" on public.challenge_entries;
create policy "own entries" on public.challenge_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.challenge_board(m text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('user', mini_card(e.user_id), 'me', e.user_id = auth.uid(),
      'symbols', e.symbols, 'start_prices', e.start_prices, 'created_at', e.created_at)), '[]'::jsonb)
  from challenge_entries e
  where e.month = m and (e.user_id = auth.uid() or (is_connected(e.user_id, auth.uid()) and not is_blocked_between(e.user_id, auth.uid())));
$$;

-- ---------- badges ----------
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
    'member_since', (select created_at from profiles where id = uid))
  else null end;
$$;

-- ---------- invite links ----------
create or replace function public.accept_invite(code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inviter uuid; me uuid := auth.uid();
begin
  if me is null then raise exception 'Log in first.'; end if;
  select id into inviter from profiles where invite_code = code;
  if inviter is null then raise exception 'That invite link is not valid.'; end if;
  if inviter = me then return mini_card(inviter); end if;
  if is_blocked_between(me, inviter) then raise exception 'That invite link is not valid.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception 'Create your profile first.'; end if;
  if exists (select 1 from connections where least(requester, addressee) = least(me, inviter)
             and greatest(requester, addressee) = greatest(me, inviter)) then
    update connections set status = 'accepted', responded_at = coalesce(responded_at, now())
      where least(requester, addressee) = least(me, inviter) and greatest(requester, addressee) = greatest(me, inviter);
  else
    -- skip the request rules (limits, accept_requests): the inviter asked for this by sharing the link
    perform set_config('app.via_invite', '1', true);
    insert into connections (requester, addressee, status, responded_at) values (inviter, me, 'accepted', now());
    perform set_config('app.via_invite', '0', true);
  end if;
  perform notify(inviter, me, 'joined', null, null, null);
  return mini_card(inviter);
end $$;

-- request rules from 001, now skipped for invite-link connections
create or replace function public.check_connection_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.via_invite', true) = '1' then return new; end if;
  if public.is_blocked_between(new.requester, new.addressee) then
    raise exception 'You can''t send a request to this person.';
  end if;
  if not coalesce((select accept_requests from profiles where id = new.addressee), false) then
    raise exception 'This person isn''t accepting requests.';
  end if;
  if (select count(*) from connections where requester = new.requester and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Daily request limit reached (20). Try again tomorrow.';
  end if;
  return new;
end $$;

-- ---------- groups / clubs ----------
create table if not exists public.groups (
  id bigint generated always as identity primary key,
  name text not null check (char_length(trim(name)) between 1 and 50),
  description text check (char_length(description) <= 200),
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id bigint not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table if not exists public.group_symbols (
  group_id bigint not null references public.groups(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, symbol)
);
create table if not exists public.group_posts (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  symbol text check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  created_at timestamptz not null default now()
);

create or replace function public.is_group_member(gid bigint, uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = uid);
$$;
create or replace function public.is_group_owner(gid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from groups where id = gid and owner = auth.uid());
$$;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_symbols enable row level security;
alter table public.group_posts enable row level security;

drop policy if exists "see my groups" on public.groups;
create policy "see my groups" on public.groups for select to authenticated using (owner = auth.uid() or is_group_member(id));
drop policy if exists "create group" on public.groups;
create policy "create group" on public.groups for insert to authenticated with check (owner = auth.uid());
drop policy if exists "edit group" on public.groups;
create policy "edit group" on public.groups for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "delete group" on public.groups;
create policy "delete group" on public.groups for delete to authenticated using (owner = auth.uid());

drop policy if exists "see members" on public.group_members;
create policy "see members" on public.group_members for select to authenticated using (is_group_member(group_id));
-- members can add their own connections; the owner row is added by trigger
drop policy if exists "add member" on public.group_members;
create policy "add member" on public.group_members for insert to authenticated
  with check (added_by = auth.uid() and is_group_member(group_id) and is_connected(user_id, auth.uid())
              and not is_blocked_between(user_id, auth.uid()));
drop policy if exists "leave or remove" on public.group_members;
create policy "leave or remove" on public.group_members for delete to authenticated
  using (user_id = auth.uid() or is_group_owner(group_id));

drop policy if exists "see symbols" on public.group_symbols;
create policy "see symbols" on public.group_symbols for select to authenticated using (is_group_member(group_id));
drop policy if exists "add symbol" on public.group_symbols;
create policy "add symbol" on public.group_symbols for insert to authenticated with check (added_by = auth.uid() and is_group_member(group_id));
drop policy if exists "remove symbol" on public.group_symbols;
create policy "remove symbol" on public.group_symbols for delete to authenticated using (is_group_member(group_id));

drop policy if exists "see posts" on public.group_posts;
create policy "see posts" on public.group_posts for select to authenticated using (is_group_member(group_id));
drop policy if exists "post" on public.group_posts;
create policy "post" on public.group_posts for insert to authenticated with check (user_id = auth.uid() and is_group_member(group_id));
drop policy if exists "delete post" on public.group_posts;
create policy "delete post" on public.group_posts for delete to authenticated using (user_id = auth.uid() or is_group_owner(group_id));

create or replace function public.trg_group_owner_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into group_members (group_id, user_id, added_by) values (new.id, new.owner, new.owner) on conflict do nothing;
  return new;
end $$;
drop trigger if exists group_owner_member on public.groups;
create trigger group_owner_member after insert on public.groups for each row execute function public.trg_group_owner_member();

create or replace function public.trg_group_member_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id <> coalesce(new.added_by, new.user_id) then
    perform notify(new.user_id, new.added_by, 'group_add', null, new.group_id,
                   jsonb_build_object('name', (select name from groups where id = new.group_id)));
  end if;
  return new;
end $$;
drop trigger if exists group_member_notify on public.group_members;
create trigger group_member_notify after insert on public.group_members for each row execute function public.trg_group_member_notify();

create or replace function public.my_groups() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'description', g.description,
      'owner', g.owner = auth.uid(),
      'members', (select count(*) from group_members m where m.group_id = g.id),
      'avatars', (select coalesce(jsonb_agg(mini_card(m.user_id)), '[]'::jsonb) from (select user_id from group_members m where m.group_id = g.id order by created_at limit 5) m),
      'last_post', (select max(created_at) from group_posts p where p.group_id = g.id)) order by g.created_at desc), '[]'::jsonb)
  from groups g where is_group_member(g.id);
$$;

create or replace function public.group_detail(gid bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_group_member(gid) then jsonb_build_object(
    'id', g.id, 'name', g.name, 'description', g.description, 'owner_id', g.owner, 'is_owner', g.owner = auth.uid(),
    'members', (select coalesce(jsonb_agg(mini_card(m.user_id) || jsonb_build_object('owner', m.user_id = g.owner) order by m.created_at), '[]'::jsonb)
                from group_members m where m.group_id = gid),
    'symbols', (select coalesce(jsonb_agg(jsonb_build_object('symbol', s.symbol, 'by', mini_card(s.added_by)) order by s.created_at), '[]'::jsonb)
                from group_symbols s where s.group_id = gid),
    'posts', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'body', p.body, 'symbol', p.symbol, 'created_at', p.created_at,
                 'author', mini_card(p.user_id), 'mine', p.user_id = auth.uid()) order by p.created_at desc), '[]'::jsonb)
              from (select * from group_posts where group_id = gid order by created_at desc limit 100) p))
  else null end
  from groups g where g.id = gid;
$$;

-- ---------- notifications list ----------
create or replace function public.my_notifications() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'data', n.data, 'read', n.read_at is not null,
      'created_at', n.created_at, 'activity_id', n.activity_id, 'group_id', n.group_id, 'actor', mini_card(n.actor)) order by n.created_at desc), '[]'::jsonb)
  from (select * from notifications where user_id = auth.uid() order by created_at desc limit 50) n;
$$;

-- ---------- grants ----------
revoke all on function public.get_feed(bigint, int, uuid, text), public.network_symbols(), public.leaderboard(),
  public.challenge_board(text), public.badges(uuid), public.accept_invite(text), public.my_groups(),
  public.group_detail(bigint), public.my_notifications() from public, anon;
grant execute on function public.get_feed(bigint, int, uuid, text), public.network_symbols(), public.leaderboard(),
  public.challenge_board(text), public.badges(uuid), public.accept_invite(text), public.my_groups(),
  public.group_detail(bigint), public.my_notifications() to authenticated;
