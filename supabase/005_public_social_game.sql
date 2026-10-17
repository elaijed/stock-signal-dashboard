-- Social v3 + game: public accounts, follows, Instagram-style posts (likes, comments,
-- saves, photos), three feeds (For you / Following / Friends), trending stocks,
-- invite rewards + the inviter's shared market-data key, Call of the Day
-- (daily up/down calls, XP), contact messages and delete-my-account.
-- Same privacy model as before: you only touch your own rows directly; anything
-- about other people comes through SECURITY DEFINER functions.
-- Safe to run more than once.

-- ---------- public / private account ----------
-- Public: your posts, polls and notes show to everyone signed in (For you feed),
-- people can follow you, and your profile can be opened by anyone.
-- Private (default): everything stays connections-only, exactly as before.
alter table public.profiles add column if not exists account_public boolean not null default false;

create or replace function public.is_public_account(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select account_public from profiles where id = uid), false);
$$;

-- ---------- posts live in activity ----------
-- kind 'post': note = caption, data = {stance: 'bull'|'bear'|null, price: number|null, image_url: text|null}
-- kind 'milestone': automatic wins (level up, streak, invite reward), data = {title, detail}
alter table public.activity drop constraint if exists activity_kind_check;
alter table public.activity add constraint activity_kind_check
  check (kind in ('buy','sell','watch','target','stop','note','poll','challenge','checkin','post','milestone'));
alter table public.activity drop constraint if exists activity_note_check;
alter table public.activity add constraint activity_note_check check (char_length(note) <= 2200);
create index if not exists activity_kind_time on public.activity (kind, id desc);

-- likes are the ❤️ reaction
alter table public.activity_reactions drop constraint if exists activity_reactions_emoji_check;
alter table public.activity_reactions add constraint activity_reactions_emoji_check
  check (emoji in ('❤️','👍','🔥','🤔','💡'));

-- who can see an activity row: as before, plus public accounts' posts for everyone signed in
create or replace function public.activity_allowed(a activity, viewer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a.user_id = viewer
    or (
      is_connected(a.user_id, viewer)
      and not is_blocked_between(a.user_id, viewer)
      and coalesce((share_of(a.user_id) ->> 'activity')::boolean, true)
      and case
        when a.kind in ('buy','sell','target','stop') then coalesce((share_of(a.user_id) ->> 'holdings')::boolean, true)
        when a.kind = 'watch' then coalesce((share_of(a.user_id) ->> 'watchlist')::boolean, true)
        else true end)
    or (
      viewer is not null
      and a.kind in ('post','poll','note','milestone')
      and coalesce((select account_public from profiles where id = a.user_id), false)
      and not is_blocked_between(a.user_id, viewer));
$$;

-- ---------- saved posts ----------
create table if not exists public.saved_posts (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id bigint not null references public.activity(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, activity_id)
);
alter table public.saved_posts enable row level security;
drop policy if exists "own saves" on public.saved_posts;
create policy "own saves" on public.saved_posts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and can_see_activity(activity_id));

-- ---------- follows (one-way, public accounts only) ----------
create table if not exists public.follows (
  follower uuid not null references auth.users(id) on delete cascade,
  followee uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index if not exists follows_followee on public.follows (followee);
alter table public.follows enable row level security;
drop policy if exists "follow" on public.follows;
create policy "follow" on public.follows for insert to authenticated
  with check (follower = auth.uid()
    and not is_blocked_between(follower, followee)
    and is_public_account(followee));
drop policy if exists "unfollow" on public.follows;
create policy "unfollow" on public.follows for delete to authenticated
  using (follower = auth.uid() or followee = auth.uid());
drop policy if exists "see own follows" on public.follows;
create policy "see own follows" on public.follows for select to authenticated
  using (auth.uid() in (follower, followee));

create or replace function public.trg_follow_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify(new.followee, new.follower, 'follow', null, null, null);
  return new;
end $$;
drop trigger if exists follow_notify on public.follows;
create trigger follow_notify after insert on public.follows for each row execute function public.trg_follow_notify();

-- blocking also removes follows both ways
create or replace function public.drop_follows_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from follows where (follower = new.blocker and followee = new.blocked)
                         or (follower = new.blocked and followee = new.blocker);
  return new;
end $$;
drop trigger if exists block_drops_follows on public.blocks;
create trigger block_drops_follows after insert on public.blocks
  for each row execute function public.drop_follows_on_block();

-- ---------- post photos (Storage) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists "post image upload own folder" on storage.objects;
create policy "post image upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "post image delete own folder" on storage.objects;
create policy "post image delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Call of the Day ----------
-- One up/down call per person per trading day, on that day's stock. Calls close at
-- 9:30am New York time on the day. The app fills in the result after the close.
create table if not exists public.daily_calls (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  symbol text not null check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  direction text not null check (direction in ('up','down')),
  result text check (result in ('win','loss','void')),
  ref_close numeric,
  close numeric,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_calls enable row level security;
drop policy if exists "see own calls" on public.daily_calls;
create policy "see own calls" on public.daily_calls for select to authenticated using (user_id = auth.uid());
drop policy if exists "make a call" on public.daily_calls;
create policy "make a call" on public.daily_calls for insert to authenticated
  with check (user_id = auth.uid() and result is null and (
    day > (now() at time zone 'America/New_York')::date
    or (day = (now() at time zone 'America/New_York')::date and (now() at time zone 'America/New_York')::time < time '09:30')));
drop policy if exists "score own call" on public.daily_calls;
create policy "score own call" on public.daily_calls for update to authenticated
  using (user_id = auth.uid() and result is null) with check (user_id = auth.uid());
-- only the result columns can change after a call is made
revoke update on public.daily_calls from authenticated;
grant update (result, ref_close, close) on public.daily_calls to authenticated;

-- how everyone called a day (counts only)
create or replace function public.call_crowd(d date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'up', (select count(*) from daily_calls where day = d and direction = 'up'),
    'down', (select count(*) from daily_calls where day = d and direction = 'down'));
$$;

-- ---------- invites: who joined through whose link ----------
create table if not exists public.invite_joins (
  invitee uuid primary key references auth.users(id) on delete cascade,
  inviter uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists invite_joins_inviter on public.invite_joins (inviter);
alter table public.invite_joins enable row level security;
drop policy if exists "see own invites" on public.invite_joins;
create policy "see own invites" on public.invite_joins for select to authenticated using (auth.uid() in (inviter, invitee));

-- A friend counts toward rewards once they've set up: 3 or more stocks on their list.
create or replace function public.qualified_invites(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from invite_joins j join portfolios p on p.user_id = j.invitee
  where j.inviter = uid
    and jsonb_array_length(coalesce(case when jsonb_typeof(p.watchlist) = 'array' then p.watchlist else p.watchlist -> 'watchlist' end, '[]'::jsonb)) >= 3;
$$;

-- one of the first 100 profiles ever made
create or replace function public.is_founding(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (select count(*) from profiles q where q.created_at < p.created_at) < 100 from profiles p where p.id = uid), false);
$$;

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
    perform set_config('app.via_invite', '1', true);
    insert into connections (requester, addressee, status, responded_at) values (inviter, me, 'accepted', now());
    perform set_config('app.via_invite', '0', true);
  end if;
  -- the first invite link you use is the one that counts toward rewards
  insert into invite_joins (invitee, inviter) values (me, inviter) on conflict (invitee) do nothing;
  perform notify(inviter, me, 'joined', null, null, null);
  return mini_card(inviter);
end $$;

-- ---------- the inviter's market-data key ----------
-- When you share invites, your key is stored here so friends who join through your
-- link get it automatically (it no longer travels inside the link itself).
create table if not exists public.invite_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  api_key text not null check (char_length(api_key) between 8 and 100),
  updated_at timestamptz not null default now()
);
alter table public.invite_keys enable row level security;
drop policy if exists "own key" on public.invite_keys;
create policy "own key" on public.invite_keys for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.invite_key(code text) returns text
language sql stable security definer set search_path = public as $$
  select k.api_key from invite_keys k join profiles p on p.id = k.user_id
  where p.invite_code = code and auth.uid() is not null;
$$;

-- ---------- XP ----------
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
  )::int;
$$;

create or replace function public.my_invite_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', (select invite_code from profiles where id = auth.uid()),
    'joined', (select count(*) from invite_joins where inviter = auth.uid()),
    'qualified', qualified_invites(auth.uid()),
    'founding', is_founding(auth.uid()),
    'invited_by', (select mini_card(inviter) from invite_joins where invitee = auth.uid()),
    'xp', xp_of(auth.uid()),
    'key_shared', exists (select 1 from invite_keys where user_id = auth.uid()));
$$;

-- ---------- badges (adds invites, founding, XP, followers) ----------
create or replace function public.badges(uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when uid = auth.uid() or is_connected(uid, auth.uid())
                or coalesce((select searchable or account_public from profiles where id = uid), false)
  then jsonb_build_object(
    'notes', (select count(*) from activity where user_id = uid and note is not null and note <> ''),
    'targets', (select count(*) from activity where user_id = uid and kind = 'target'),
    'wins', (select count(*) from activity where user_id = uid and kind = 'sell' and (data ->> 'gainPct')::numeric > 0),
    'trades', (select count(*) from activity where user_id = uid and kind in ('buy','sell')),
    'polls', (select count(*) from activity where user_id = uid and kind = 'poll'),
    'posts', (select count(*) from activity where user_id = uid and kind = 'post'),
    'challenges', (select count(*) from challenge_entries where user_id = uid),
    'connections', (select count(*) from connections c where c.status = 'accepted' and uid in (c.requester, c.addressee)),
    'streak', streak_weeks(uid),
    'invites', qualified_invites(uid),
    'founding', is_founding(uid),
    'xp', xp_of(uid),
    'calls', (select count(*) from daily_calls where user_id = uid),
    'call_wins', (select count(*) from daily_calls where user_id = uid and result = 'win'),
    'followers', (select count(*) from follows where followee = uid),
    'member_since', (select created_at from profiles where id = uid))
  else null end;
$$;

-- ---------- feeds ----------
-- mode: 'foryou'    public posts from everyone (plus yours), newest first
--       'following' you + people you follow
--       'friends'   you + your connections (the old feed)
--       'all'       anything you're allowed to see (profile pages, a stock's wall,
--                   one post: before_id = id + 1, lim = 1)
create or replace function public.get_feed2(mode text default 'friends', before_id bigint default null, lim int default 30,
                                           only_user uuid default null, only_symbol text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  items as (
    select a.* from activity a, me
    where me.uid is not null
      and (before_id is null or a.id < before_id)
      and a.kind <> 'checkin'
      and (only_user is null or a.user_id = only_user)
      and (only_symbol is null or a.symbol = upper(only_symbol))
      and activity_allowed(a, me.uid)
      and case coalesce(mode, 'friends')
        when 'foryou' then a.kind in ('post','poll','note','milestone')
          and (a.user_id = me.uid or coalesce((select account_public from profiles where id = a.user_id), false))
        when 'following' then a.user_id = me.uid
          or exists (select 1 from follows f where f.follower = me.uid and f.followee = a.user_id)
        when 'all' then true
        else a.user_id = me.uid or is_connected(a.user_id, me.uid) end
    order by a.id desc
    limit least(greatest(coalesce(lim, 30), 1), 100)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'kind', i.kind, 'symbol', i.symbol, 'note', i.note, 'created_at', i.created_at,
      'data', activity_data_for(i, (select uid from me)),
      'author', mini_card(i.user_id) || jsonb_build_object(
          'account_public', coalesce((select account_public from profiles where id = i.user_id), false),
          'xp', xp_of(i.user_id),
          'founding', is_founding(i.user_id)),
      'mine', i.user_id = (select uid from me),
      'following', exists (select 1 from follows f where f.follower = (select uid from me) and f.followee = i.user_id),
      'connected', is_connected(i.user_id, (select uid from me)),
      'likes', (select count(*) from activity_reactions where activity_id = i.id and emoji = '❤️'),
      'liked', exists (select 1 from activity_reactions where activity_id = i.id and emoji = '❤️' and user_id = (select uid from me)),
      'saved', exists (select 1 from saved_posts where activity_id = i.id and user_id = (select uid from me)),
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

-- your saved posts, newest save first
create or replace function public.saved_feed() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(p.item order by p.saved_at desc), '[]'::jsonb) from (
    select s.created_at saved_at, (get_feed2('all', s.activity_id + 1, 1, null, null)) -> 0 as item
    from saved_posts s where s.user_id = auth.uid() order by s.created_at desc limit 60) p
  where p.item is not null;
$$;

-- most-posted-about stocks this week
create or replace function public.trending_symbols() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('symbol', t.symbol, 'posts', t.n) order by t.n desc), '[]'::jsonb) from (
    select a.symbol, count(*) n from activity a
    where a.symbol is not null and a.kind in ('post','poll','note')
      and a.created_at > now() - interval '7 days' and activity_allowed(a, auth.uid())
    group by a.symbol order by n desc limit 10) t;
$$;

-- public accounts to follow: most followed first, not you, not already followed
create or replace function public.discover_people() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t.card order by t.followers desc, t.created_at desc), '[]'::jsonb) from (
    select public.profile_card(p, public.relation_to(p.id)) || jsonb_build_object(
             'followers', (select count(*) from follows where followee = p.id),
             'xp', xp_of(p.id), 'founding', is_founding(p.id)) card,
           (select count(*) from follows where followee = p.id) followers, p.created_at
    from profiles p
    where p.account_public and p.id <> auth.uid()
      and not is_blocked_between(auth.uid(), p.id)
      and not exists (select 1 from follows f where f.follower = auth.uid() and f.followee = p.id)
    order by followers desc, p.created_at desc limit 20) t;
$$;

-- follower / following / post counts + your relationship, for a profile page
create or replace function public.follow_info(uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when uid = auth.uid() or is_connected(uid, auth.uid())
                or (coalesce((select searchable or account_public from profiles where id = uid), false) and not is_blocked_between(uid, auth.uid()))
  then jsonb_build_object(
    'account_public', coalesce((select account_public from profiles where id = uid), false),
    'followers', (select count(*) from follows where followee = uid),
    'following', (select count(*) from follows where follower = uid),
    'posts', (select count(*) from activity a where a.user_id = uid and a.kind in ('post','poll','note') and activity_allowed(a, auth.uid())),
    'i_follow', exists (select 1 from follows where follower = auth.uid() and followee = uid),
    'follows_me', exists (select 1 from follows where follower = uid and followee = auth.uid()))
  else null end;
$$;

-- lists of followers / following (public cards)
create or replace function public.follow_list(uid uuid, which text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.profile_card(p, public.relation_to(p.id)) order by f.created_at desc), '[]'::jsonb)
  from follows f join profiles p on p.id = case when which = 'following' then f.followee else f.follower end
  where (case when which = 'following' then f.follower else f.followee end) = uid
    and not is_blocked_between(auth.uid(), p.id)
    and (uid = auth.uid() or coalesce((select account_public from profiles where id = uid), false) or is_connected(uid, auth.uid()));
$$;

-- ---------- public accounts can be found and opened ----------
create or replace function public.search_profiles(q text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare term text := lower(trim(coalesce(q, '')));
begin
  if auth.uid() is null or char_length(term) < 2 then return '[]'::jsonb; end if;
  term := replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_');
  return coalesce((
    select jsonb_agg(public.profile_card(p, public.relation_to(p.id)) order by
             (lower(p.username::text) = term) desc, (lower(p.username::text) like term || '%') desc, p.full_name)
    from (select * from profiles p
          where p.id <> auth.uid()
            and (p.searchable or p.account_public or public.relation_to(p.id) <> 'none')
            and not public.is_blocked_between(auth.uid(), p.id)
            and (lower(p.username::text) like '%' || term || '%' or lower(p.full_name) like '%' || term || '%')
          limit 20) p), '[]'::jsonb);
end $$;

create or replace function public.get_profile(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p profiles; rel text; out jsonb := '{}'::jsonb; f text; aud text; doc jsonb;
  fields text[] := array['full_name','username','avatar_url','banner_color','headline','bio','location','pronouns',
    'job_title','company','industry','school','degree','field_of_study','grad_year','years_investing',
    'experience_level','styles','risk_tolerance','sectors','goals','brokers','links'];
begin
  if auth.uid() is null then return null; end if;
  select * into p from profiles where id = uid;
  if not found then return null; end if;
  rel := public.relation_to(uid);
  if rel <> 'self' and public.is_blocked_between(auth.uid(), uid) then return null; end if;
  if rel = 'none' and not (p.searchable or p.account_public) then return null; end if;

  for f in select unnest(fields) loop
    aud := coalesce(p.visibility ->> f, public.field_default_audience(f));
    if f in ('full_name','username') or rel = 'self' or aud = 'everyone' or (aud = 'connections' and rel = 'connected') then
      out := out || jsonb_build_object(f, to_jsonb(p) -> f);
    end if;
  end loop;

  aud := coalesce(p.visibility ->> 'member_since', public.field_default_audience('member_since'));
  if rel = 'self' or aud = 'everyone' or (aud = 'connections' and rel = 'connected') then
    out := out || jsonb_build_object('member_since', p.created_at);
  end if;

  aud := coalesce(p.visibility ->> 'counts', 'everyone');
  if rel = 'self' or aud = 'everyone' or (aud = 'connections' and rel = 'connected') then
    select watchlist into doc from portfolios where user_id = uid;
    out := out || jsonb_build_object(
      'connection_count', (select count(*) from connections c where c.status = 'accepted' and uid in (c.requester, c.addressee)),
      'owned_count', (select count(*) from jsonb_array_elements(coalesce(case when jsonb_typeof(doc) = 'array' then doc else doc -> 'watchlist' end, '[]')) e where e ->> 'status' = 'owned'),
      'watching_count', (select count(*) from jsonb_array_elements(coalesce(case when jsonb_typeof(doc) = 'array' then doc else doc -> 'watchlist' end, '[]')) e where coalesce(e ->> 'status', '') <> 'owned'));
  end if;

  if rel = 'self' then
    out := out || jsonb_build_object('visibility', p.visibility, 'share', p.share, 'searchable', p.searchable, 'accept_requests', p.accept_requests);
  end if;
  return out || jsonb_build_object('id', p.id, 'relation', rel, 'account_public', p.account_public,
    'share', case when rel in ('self','connected') then p.share else null end);
end $$;

-- ---------- contact form ----------
create table if not exists public.contact_messages (
  id bigint generated always as identity primary key,
  name text not null check (char_length(trim(name)) between 1 and 80),
  email text not null check (char_length(email) between 3 and 120 and email like '%@%'),
  body text not null check (char_length(trim(body)) between 1 and 2000),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
drop policy if exists "send a message" on public.contact_messages;
create policy "send a message" on public.contact_messages for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
grant insert on public.contact_messages to anon, authenticated;

-- ---------- delete my account ----------
-- The app removes your photos through Storage first, then calls this.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Log in first.'; end if;
  delete from portfolios where user_id = me;
  delete from profiles where id = me;
  delete from auth.users where id = me;
end $$;

-- ---------- permissions ----------
revoke all on function public.call_crowd(date), public.qualified_invites(uuid), public.is_founding(uuid),
  public.invite_key(text), public.xp_of(uuid), public.my_invite_stats(), public.get_feed2(text, bigint, int, uuid, text),
  public.saved_feed(), public.trending_symbols(), public.discover_people(), public.follow_info(uuid),
  public.follow_list(uuid, text), public.delete_my_account() from public, anon;
grant execute on function public.call_crowd(date), public.qualified_invites(uuid), public.is_founding(uuid),
  public.invite_key(text), public.xp_of(uuid), public.my_invite_stats(), public.get_feed2(text, bigint, int, uuid, text),
  public.saved_feed(), public.trending_symbols(), public.discover_people(), public.follow_info(uuid),
  public.follow_list(uuid, text), public.delete_my_account() to authenticated;
