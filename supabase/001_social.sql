-- Social features: public profiles, connections, blocks, reports, avatars.
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent where practical).
--
-- Privacy model: other users NEVER select from profiles or portfolios directly.
-- RLS only lets you touch your own rows; everything about other people comes
-- through SECURITY DEFINER functions below, which filter each field by the
-- owner's visibility settings and your relationship (self / connection / other).

create extension if not exists citext;
create extension if not exists pg_trgm;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  full_name text not null check (char_length(full_name) between 1 and 60),
  avatar_url text,
  banner_color text default 'blue',
  headline text check (char_length(headline) <= 80),
  bio text check (char_length(bio) <= 300),
  location text check (char_length(location) <= 60),
  pronouns text check (char_length(pronouns) <= 20),
  job_title text check (char_length(job_title) <= 60),
  company text check (char_length(company) <= 60),
  industry text check (char_length(industry) <= 60),
  school text check (char_length(school) <= 80),
  degree text check (char_length(degree) <= 60),
  field_of_study text check (char_length(field_of_study) <= 60),
  grad_year int check (grad_year between 1940 and 2100),
  years_investing int check (years_investing between 0 and 80),
  experience_level text check (experience_level in ('beginner','intermediate','advanced','professional')),
  styles text[] not null default '{}',
  risk_tolerance text check (risk_tolerance in ('low','medium','high')),
  sectors text[] not null default '{}',
  goals text check (char_length(goals) <= 200),
  brokers text[] not null default '{}',
  links jsonb not null default '{}'::jsonb,       -- {website, linkedin, x, instagram, youtube}
  -- per-field audience: 'everyone' | 'connections' | 'private'. Missing key = default below.
  visibility jsonb not null default '{}'::jsonb,
  -- what connections may see of the portfolio (true/false per key)
  share jsonb not null default '{"holdings":true,"dollars":true,"unrealized":true,"realized":true,"watchlist":true,"sectors":true,"alerts":false}'::jsonb,
  searchable boolean not null default false,
  accept_requests boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create index if not exists profiles_name_trgm on public.profiles using gin ((lower(full_name)) gin_trgm_ops);

-- ---------- connections ----------
create table if not exists public.connections (
  id bigint generated always as identity primary key,
  requester uuid not null references auth.users(id) on delete cascade,
  addressee uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester <> addressee)
);
create unique index if not exists connections_pair on public.connections
  (least(requester, addressee), greatest(requester, addressee));

alter table public.connections enable row level security;
drop policy if exists "see own connections" on public.connections;
create policy "see own connections" on public.connections
  for select to authenticated using (auth.uid() in (requester, addressee));
drop policy if exists "send request" on public.connections;
create policy "send request" on public.connections
  for insert to authenticated with check (requester = auth.uid() and status = 'pending');
drop policy if exists "accept request" on public.connections;
create policy "accept request" on public.connections
  for update to authenticated using (addressee = auth.uid() and status = 'pending')
  with check (addressee = auth.uid() and status = 'accepted');
drop policy if exists "remove connection" on public.connections;
create policy "remove connection" on public.connections
  for delete to authenticated using (auth.uid() in (requester, addressee));
-- Declining a request = deleting it (either side).

-- ---------- blocks ----------
create table if not exists public.blocks (
  blocker uuid not null references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
drop policy if exists "own blocks" on public.blocks;
create policy "own blocks" on public.blocks
  for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

-- ---------- reports ----------
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter uuid not null references auth.users(id) on delete cascade,
  reported uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "file report" on public.reports;
create policy "file report" on public.reports
  for insert to authenticated with check (reporter = auth.uid());
drop policy if exists "see own reports" on public.reports;
create policy "see own reports" on public.reports
  for select to authenticated using (reporter = auth.uid());

-- ---------- helpers ----------
create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;

create or replace function public.relation_to(other uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when other = auth.uid() then 'self'
    when exists (select 1 from connections c where c.status = 'accepted'
                 and ((c.requester = auth.uid() and c.addressee = other) or (c.requester = other and c.addressee = auth.uid()))) then 'connected'
    when exists (select 1 from connections c where c.status = 'pending' and c.requester = auth.uid() and c.addressee = other) then 'pending_out'
    when exists (select 1 from connections c where c.status = 'pending' and c.requester = other and c.addressee = auth.uid()) then 'pending_in'
    else 'none' end;
$$;

-- Request rules: not blocked, addressee accepts requests, max 20 new requests per day.
create or replace function public.check_connection_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
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
drop trigger if exists connection_request_rules on public.connections;
create trigger connection_request_rules before insert on public.connections
  for each row execute function public.check_connection_request();

create or replace function public.stamp_response() returns trigger
language plpgsql as $$
begin
  if new.status = 'accepted' and old.status = 'pending' then new.responded_at := now(); end if;
  -- only the status may change
  new.requester := old.requester; new.addressee := old.addressee; new.note := old.note; new.created_at := old.created_at;
  return new;
end $$;
drop trigger if exists connection_response on public.connections;
create trigger connection_response before update on public.connections
  for each row execute function public.stamp_response();

-- Blocking someone removes any connection/request between you.
create or replace function public.drop_connection_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from connections where (requester = new.blocker and addressee = new.blocked)
                             or (requester = new.blocked and addressee = new.blocker);
  return new;
end $$;
drop trigger if exists block_drops_connection on public.blocks;
create trigger block_drops_connection after insert on public.blocks
  for each row execute function public.drop_connection_on_block();

create or replace function public.touch_profile() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_profile();

-- Default audience per field (used when visibility has no entry for it).
create or replace function public.field_default_audience(field text) returns text
language sql immutable as $$
  select case
    when field in ('full_name','username','avatar_url','banner_color','headline') then 'everyone'
    when field in ('bio','experience_level','styles','sectors','years_investing','risk_tolerance','member_since') then 'everyone'
    else 'connections' end;
$$;

-- ---------- read other people (filtered) ----------

-- Public card fields for search results / lists.
create or replace function public.profile_card(p profiles, rel text) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', p.id, 'username', p.username, 'full_name', p.full_name,
    'avatar_url', p.avatar_url, 'headline', p.headline, 'banner_color', p.banner_color, 'relation', rel);
$$;

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
            and (p.searchable or public.relation_to(p.id) <> 'none')
            and not public.is_blocked_between(auth.uid(), p.id)
            and (lower(p.username::text) like '%' || term || '%' or lower(p.full_name) like '%' || term || '%')
          limit 20) p), '[]'::jsonb);
end $$;

-- Full profile, each field filtered by audience. Null if you can't see this person.
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
  if rel = 'none' and not p.searchable then return null; end if;

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
  return out || jsonb_build_object('id', p.id, 'relation', rel,
    'share', case when rel in ('self','connected') then p.share else null end);
end $$;

-- A connection's portfolio, filtered by their share settings. Null unless connected (or yourself).
create or replace function public.get_shared_portfolio(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rel text; s jsonb; doc jsonb; items jsonb; out jsonb := '{}'::jsonb;
begin
  rel := public.relation_to(uid);
  if rel not in ('connected','self') then return null; end if;
  select share into s from profiles where id = uid;
  s := coalesce(s, '{}'::jsonb);
  select watchlist into doc from portfolios where user_id = uid;
  items := coalesce(case when jsonb_typeof(doc) = 'array' then doc else doc -> 'watchlist' end, '[]'::jsonb);

  if rel = 'self' or coalesce((s ->> 'holdings')::boolean, true) then
    out := out || jsonb_build_object('owned', coalesce((
      select jsonb_agg(case when rel = 'self' or coalesce((s ->> 'dollars')::boolean, true)
                            then e else jsonb_build_object('symbol', e ->> 'symbol', 'status', 'owned', 'purchaseDate', e ->> 'purchaseDate',
                                   'buyPrice', e -> 'buyPrice') end)
      from jsonb_array_elements(items) e where e ->> 'status' = 'owned'), '[]'::jsonb));
  end if;
  if rel = 'self' or coalesce((s ->> 'watchlist')::boolean, true) then
    out := out || jsonb_build_object('watchlist', coalesce((
      select jsonb_agg(jsonb_build_object('symbol', e ->> 'symbol', 'status', 'watching'))
      from jsonb_array_elements(items) e where coalesce(e ->> 'status', '') <> 'owned'), '[]'::jsonb));
  end if;
  if rel = 'self' or coalesce((s ->> 'realized')::boolean, true) then
    out := out || jsonb_build_object('transactions', coalesce(doc -> 'transactions', '[]'::jsonb));
  end if;
  if rel = 'self' or coalesce((s ->> 'alerts')::boolean, false) then
    out := out || jsonb_build_object('alerts', coalesce(doc -> 'alerts', '[]'::jsonb));
  end if;
  return out || jsonb_build_object('share', s);
end $$;

-- People you may know: searchable, not connected/blocked, sharing school, company or sectors.
create or replace function public.suggested_profiles() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select * from profiles where id = auth.uid())
  select coalesce(jsonb_agg(public.profile_card(p, public.relation_to(p.id))), '[]'::jsonb) from (
    select p.* from profiles p, me
    where p.id <> me.id and p.searchable
      and public.relation_to(p.id) = 'none'
      and not public.is_blocked_between(me.id, p.id)
      and ((p.school is not null and lower(p.school) = lower(me.school))
        or (p.company is not null and lower(p.company) = lower(me.company))
        or (p.sectors && me.sectors))
    order by ((p.school is not null and lower(p.school) = lower(me.school))::int
            + (p.company is not null and lower(p.company) = lower(me.company))::int
            + cardinality(array(select unnest(p.sectors) intersect select unnest(me.sectors)))) desc
    limit 10) p;
$$;

-- My connections and requests, with the other person's card.
create or replace function public.my_network() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'connections', coalesce((select jsonb_agg(public.profile_card(p, 'connected') || jsonb_build_object('since', c.responded_at) order by p.full_name)
       from connections c join profiles p on p.id = case when c.requester = auth.uid() then c.addressee else c.requester end
       where c.status = 'accepted' and auth.uid() in (c.requester, c.addressee)), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(public.profile_card(p, 'pending_in') || jsonb_build_object('note', c.note, 'request_id', c.id, 'at', c.created_at) order by c.created_at desc)
       from connections c join profiles p on p.id = c.requester
       where c.status = 'pending' and c.addressee = auth.uid()), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(public.profile_card(p, 'pending_out') || jsonb_build_object('request_id', c.id, 'at', c.created_at) order by c.created_at desc)
       from connections c join profiles p on p.id = c.addressee
       where c.status = 'pending' and c.requester = auth.uid()), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'full_name', p.full_name, 'avatar_url', p.avatar_url))
       from blocks b join profiles p on p.id = b.blocked where b.blocker = auth.uid()), '[]'::jsonb));
$$;

create or replace function public.username_available(name text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where username = name::citext and id <> auth.uid());
$$;

revoke all on function public.search_profiles(text), public.get_profile(uuid), public.get_shared_portfolio(uuid),
  public.suggested_profiles(), public.my_network(), public.username_available(text) from public, anon;
grant execute on function public.search_profiles(text), public.get_profile(uuid), public.get_shared_portfolio(uuid),
  public.suggested_profiles(), public.my_network(), public.username_available(text) to authenticated;

-- ---------- avatars (Storage) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "avatar upload own folder" on storage.objects;
create policy "avatar upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar update own folder" on storage.objects;
create policy "avatar update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar delete own folder" on storage.objects;
create policy "avatar delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
