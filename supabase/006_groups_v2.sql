-- Groups v2: clubs people can actually run.
-- Public / request-to-join / private groups, a directory to find them, invite codes,
-- roles (owner, admin, member), join requests, announcement-only groups, pinned posts,
-- stock pitches with member votes (and a tracked return since the pitch), and meetings.
-- Same privacy model as before: tables are only touched through RLS for your own rows;
-- everything about a group is read through SECURITY DEFINER functions.
-- Only adds things. Safe to run more than once.

-- ---------- group settings ----------
alter table public.groups add column if not exists privacy text not null default 'private';
alter table public.groups add column if not exists category text not null default 'club';
alter table public.groups add column if not exists rules text;
alter table public.groups add column if not exists posting text not null default 'everyone';
alter table public.groups add column if not exists invite_code text;
alter table public.groups drop constraint if exists groups_privacy_check;
alter table public.groups add constraint groups_privacy_check check (privacy in ('public', 'request', 'private'));
alter table public.groups drop constraint if exists groups_category_check;
alter table public.groups add constraint groups_category_check
  check (category in ('club', 'school', 'strategy', 'sector', 'learning', 'friends', 'other'));
alter table public.groups drop constraint if exists groups_posting_check;
alter table public.groups add constraint groups_posting_check check (posting in ('everyone', 'admins'));
alter table public.groups drop constraint if exists groups_rules_check;
alter table public.groups add constraint groups_rules_check check (char_length(rules) <= 1000);
alter table public.groups drop constraint if exists groups_description_check;
alter table public.groups add constraint groups_description_check check (char_length(description) <= 500);
update public.groups set invite_code = substr(md5(random()::text || id::text), 1, 8) where invite_code is null;
alter table public.groups alter column invite_code set default substr(md5(random()::text), 1, 8);
create unique index if not exists groups_invite_code on public.groups (invite_code);
create index if not exists groups_privacy on public.groups (privacy);

alter table public.group_members add column if not exists role text not null default 'member';
alter table public.group_members drop constraint if exists group_members_role_check;
alter table public.group_members add constraint group_members_role_check check (role in ('owner', 'admin', 'member'));
update public.group_members m set role = 'owner' from public.groups g where g.id = m.group_id and g.owner = m.user_id and m.role <> 'owner';

alter table public.group_posts add column if not exists pinned boolean not null default false;
alter table public.group_posts drop constraint if exists group_posts_body_check;
alter table public.group_posts add constraint group_posts_body_check check (char_length(trim(body)) between 1 and 2000);

create or replace function public.is_group_admin(gid bigint, uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = uid and role in ('owner', 'admin'));
$$;
create or replace function public.can_post_in_group(gid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select is_group_member(gid) and ((select posting from groups where id = gid) = 'everyone' or is_group_admin(gid));
$$;

-- owner row gets the owner role
create or replace function public.trg_group_owner_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into group_members (group_id, user_id, added_by, role) values (new.id, new.owner, new.owner, 'owner')
  on conflict (group_id, user_id) do update set role = 'owner';
  return new;
end $$;

-- ---------- policies that change ----------
drop policy if exists "edit group" on public.groups;
create policy "edit group" on public.groups for update to authenticated using (is_group_admin(id)) with check (is_group_admin(id));

drop policy if exists "add member" on public.group_members;
create policy "add member" on public.group_members for insert to authenticated
  with check (added_by = auth.uid() and role = 'member' and is_group_member(group_id) and is_connected(user_id, auth.uid())
              and not is_blocked_between(user_id, auth.uid()));
drop policy if exists "leave or remove" on public.group_members;
create policy "leave or remove" on public.group_members for delete to authenticated
  using ((user_id = auth.uid() and role <> 'owner') or (is_group_admin(group_id) and role = 'member') or is_group_owner(group_id) and role <> 'owner');

drop policy if exists "remove symbol" on public.group_symbols;
create policy "remove symbol" on public.group_symbols for delete to authenticated
  using (is_group_member(group_id) and (added_by = auth.uid() or is_group_admin(group_id)));

drop policy if exists "post" on public.group_posts;
create policy "post" on public.group_posts for insert to authenticated
  with check (user_id = auth.uid() and can_post_in_group(group_id) and pinned = false);
drop policy if exists "delete post" on public.group_posts;
create policy "delete post" on public.group_posts for delete to authenticated using (user_id = auth.uid() or is_group_admin(group_id));

-- ---------- join requests ----------
create table if not exists public.group_requests (
  group_id bigint not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.group_requests enable row level security;
drop policy if exists "see own or admin requests" on public.group_requests;
create policy "see own or admin requests" on public.group_requests for select to authenticated
  using (user_id = auth.uid() or is_group_admin(group_id));
drop policy if exists "cancel own request" on public.group_requests;
create policy "cancel own request" on public.group_requests for delete to authenticated
  using (user_id = auth.uid() or is_group_admin(group_id));

-- ---------- pitches: a member pitches a stock, the group votes, the return is tracked ----------
create table if not exists public.group_ideas (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  stance text not null default 'bull' check (stance in ('bull', 'bear')),
  thesis text not null check (char_length(trim(thesis)) between 1 and 1500),
  entry_price numeric check (entry_price > 0),
  target_price numeric check (target_price > 0),
  status text not null default 'open' check (status in ('open', 'adopted', 'passed', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists group_ideas_group on public.group_ideas (group_id, created_at desc);
create table if not exists public.group_idea_votes (
  idea_id bigint not null references public.group_ideas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote text not null check (vote in ('yes', 'no')),
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);
alter table public.group_ideas enable row level security;
alter table public.group_idea_votes enable row level security;
drop policy if exists "see ideas" on public.group_ideas;
create policy "see ideas" on public.group_ideas for select to authenticated using (is_group_member(group_id));
drop policy if exists "pitch" on public.group_ideas;
create policy "pitch" on public.group_ideas for insert to authenticated
  with check (user_id = auth.uid() and is_group_member(group_id) and status = 'open');
drop policy if exists "remove idea" on public.group_ideas;
create policy "remove idea" on public.group_ideas for delete to authenticated using (user_id = auth.uid() or is_group_admin(group_id));
drop policy if exists "see votes" on public.group_idea_votes;
create policy "see votes" on public.group_idea_votes for select to authenticated
  using (exists (select 1 from group_ideas i where i.id = idea_id and is_group_member(i.group_id)));
drop policy if exists "vote" on public.group_idea_votes;
create policy "vote" on public.group_idea_votes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from group_ideas i where i.id = idea_id and i.status = 'open' and is_group_member(i.group_id)));
drop policy if exists "change vote" on public.group_idea_votes;
create policy "change vote" on public.group_idea_votes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "unvote" on public.group_idea_votes;
create policy "unvote" on public.group_idea_votes for delete to authenticated using (user_id = auth.uid());

-- ---------- meetings ----------
create table if not exists public.group_events (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 100),
  starts_at timestamptz not null,
  location text check (char_length(location) <= 300),
  details text check (char_length(details) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists group_events_group on public.group_events (group_id, starts_at);
create table if not exists public.group_event_rsvps (
  event_id bigint not null references public.group_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  going boolean not null default true,
  primary key (event_id, user_id)
);
alter table public.group_events enable row level security;
alter table public.group_event_rsvps enable row level security;
drop policy if exists "see events" on public.group_events;
create policy "see events" on public.group_events for select to authenticated using (is_group_member(group_id));
drop policy if exists "add event" on public.group_events;
create policy "add event" on public.group_events for insert to authenticated with check (created_by = auth.uid() and is_group_admin(group_id));
drop policy if exists "remove event" on public.group_events;
create policy "remove event" on public.group_events for delete to authenticated using (is_group_admin(group_id));
drop policy if exists "see rsvps" on public.group_event_rsvps;
create policy "see rsvps" on public.group_event_rsvps for select to authenticated
  using (exists (select 1 from group_events e where e.id = event_id and is_group_member(e.group_id)));
drop policy if exists "rsvp" on public.group_event_rsvps;
create policy "rsvp" on public.group_event_rsvps for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from group_events e where e.id = event_id and is_group_member(e.group_id)));
drop policy if exists "change rsvp" on public.group_event_rsvps;
create policy "change rsvp" on public.group_event_rsvps for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "drop rsvp" on public.group_event_rsvps;
create policy "drop rsvp" on public.group_event_rsvps for delete to authenticated using (user_id = auth.uid());

-- ---------- functions ----------
-- my groups, with what's new
create or replace function public.my_groups() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'description', g.description,
      'owner', g.owner = auth.uid(), 'role', m.role, 'privacy', g.privacy, 'category', g.category, 'posting', g.posting,
      'members', (select count(*) from group_members x where x.group_id = g.id),
      'avatars', (select coalesce(jsonb_agg(mini_card(x.user_id)), '[]'::jsonb) from (select user_id from group_members x where x.group_id = g.id order by created_at limit 5) x),
      'last_post', (select max(created_at) from group_posts p where p.group_id = g.id),
      'last_message', (select jsonb_build_object('body', left(p.body, 90), 'name', (mini_card(p.user_id) ->> 'full_name'), 'mine', p.user_id = auth.uid())
                       from group_posts p where p.group_id = g.id order by p.created_at desc limit 1),
      'unread', (select count(*) from notifications n where n.user_id = auth.uid() and n.group_id = g.id and n.read_at is null),
      'open_ideas', (select count(*) from group_ideas i where i.group_id = g.id and i.status = 'open'),
      'requests', case when m.role in ('owner', 'admin') then (select count(*) from group_requests r where r.group_id = g.id) else 0 end,
      'next_event', (select jsonb_build_object('title', e.title, 'starts_at', e.starts_at) from group_events e
                     where e.group_id = g.id and e.starts_at > now() - interval '2 hours' order by e.starts_at limit 1))
    order by greatest(g.created_at, coalesce((select max(created_at) from group_posts p where p.group_id = g.id), g.created_at)) desc), '[]'::jsonb)
  from groups g join group_members m on m.group_id = g.id and m.user_id = auth.uid();
$$;

-- the directory: public and request-to-join groups
create or replace function public.discover_groups(q text default null, cat text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.members desc, t.id desc), '[]'::jsonb) from (
    select g.id, g.name, g.description, g.privacy, g.category,
      (select count(*) from group_members x where x.group_id = g.id) as members,
      (select coalesce(jsonb_agg(mini_card(x.user_id)), '[]'::jsonb) from (select user_id from group_members x where x.group_id = g.id order by created_at limit 4) x) as avatars,
      is_group_member(g.id) as is_member,
      exists (select 1 from group_requests r where r.group_id = g.id and r.user_id = auth.uid()) as requested,
      (select count(*) from group_members x where x.group_id = g.id and is_connected(x.user_id, auth.uid())) as friends,
      (select max(created_at) from group_posts p where p.group_id = g.id) as last_post
    from groups g
    where g.privacy in ('public', 'request')
      and (cat is null or cat = '' or g.category = cat)
      and (q is null or q = '' or g.name ilike '%' || q || '%' or g.description ilike '%' || q || '%')
      and not is_blocked_between(g.owner, auth.uid())
    limit 50) t;
$$;

-- everything about one group (members see it all; others see a preview of public/request groups)
create or replace function public.group_detail(gid bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select case
  when is_group_member(gid) then jsonb_build_object(
    'id', g.id, 'name', g.name, 'description', g.description, 'owner_id', g.owner, 'is_owner', g.owner = auth.uid(),
    'is_member', true, 'is_admin', is_group_admin(gid),
    'role', (select role from group_members where group_id = gid and user_id = auth.uid()),
    'privacy', g.privacy, 'category', g.category, 'rules', g.rules, 'posting', g.posting, 'created_at', g.created_at,
    'invite_code', g.invite_code,
    'members', (select coalesce(jsonb_agg(mini_card(m.user_id) || jsonb_build_object('owner', m.user_id = g.owner, 'role', m.role, 'joined', m.created_at)
                  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at), '[]'::jsonb)
                from group_members m where m.group_id = gid),
    'requests', case when is_group_admin(gid) then (select coalesce(jsonb_agg(mini_card(r.user_id) || jsonb_build_object('note', r.note, 'created_at', r.created_at) order by r.created_at), '[]'::jsonb)
                from group_requests r where r.group_id = gid) else '[]'::jsonb end,
    'symbols', (select coalesce(jsonb_agg(jsonb_build_object('symbol', s.symbol, 'by', mini_card(s.added_by), 'mine', s.added_by = auth.uid()) order by s.created_at), '[]'::jsonb)
                from group_symbols s where s.group_id = gid),
    'posts', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'body', p.body, 'symbol', p.symbol, 'created_at', p.created_at, 'pinned', p.pinned,
                 'author', mini_card(p.user_id), 'mine', p.user_id = auth.uid()) order by p.created_at desc), '[]'::jsonb)
              from (select * from group_posts where group_id = gid order by created_at desc limit 150) p),
    'pinned', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'body', p.body, 'created_at', p.created_at, 'author', mini_card(p.user_id)) order by p.created_at desc), '[]'::jsonb)
               from group_posts p where p.group_id = gid and p.pinned),
    'ideas', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'symbol', i.symbol, 'stance', i.stance, 'thesis', i.thesis,
                 'entry_price', i.entry_price, 'target_price', i.target_price, 'status', i.status, 'created_at', i.created_at,
                 'author', mini_card(i.user_id), 'mine', i.user_id = auth.uid(),
                 'yes', (select count(*) from group_idea_votes v where v.idea_id = i.id and v.vote = 'yes'),
                 'no', (select count(*) from group_idea_votes v where v.idea_id = i.id and v.vote = 'no'),
                 'my_vote', (select vote from group_idea_votes v where v.idea_id = i.id and v.user_id = auth.uid())) order by i.created_at desc), '[]'::jsonb)
              from (select * from group_ideas where group_id = gid order by created_at desc limit 60) i),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'location', e.location, 'details', e.details,
                 'going', (select count(*) from group_event_rsvps r where r.event_id = e.id and r.going),
                 'me_going', (select going from group_event_rsvps r where r.event_id = e.id and r.user_id = auth.uid())) order by e.starts_at), '[]'::jsonb)
               from group_events e where e.group_id = gid and e.starts_at > now() - interval '2 hours'))
  when g.privacy in ('public', 'request') and not is_blocked_between(g.owner, auth.uid()) then jsonb_build_object(
    'id', g.id, 'name', g.name, 'description', g.description, 'is_member', false, 'is_admin', false,
    'privacy', g.privacy, 'category', g.category, 'rules', g.rules, 'posting', g.posting, 'created_at', g.created_at,
    'requested', exists (select 1 from group_requests r where r.group_id = gid and r.user_id = auth.uid()),
    'member_count', (select count(*) from group_members m where m.group_id = gid),
    'members', (select coalesce(jsonb_agg(mini_card(m.user_id) || jsonb_build_object('role', m.role)), '[]'::jsonb)
                from (select * from group_members where group_id = gid order by case role when 'owner' then 0 when 'admin' then 1 else 2 end, created_at limit 8) m),
    'friends', (select count(*) from group_members x where x.group_id = gid and is_connected(x.user_id, auth.uid())),
    'idea_count', (select count(*) from group_ideas i where i.group_id = gid),
    'symbols', (select coalesce(jsonb_agg(jsonb_build_object('symbol', s.symbol) order by s.created_at), '[]'::jsonb) from group_symbols s where s.group_id = gid))
  else null end
  from groups g where g.id = gid;
$$;

-- join (public), ask to join (request), or join with an invite code (any group)
create or replace function public.join_group(gid bigint, note text default null, code text default null) returns text
language plpgsql security definer set search_path = public as $$
declare g groups;
begin
  if auth.uid() is null then raise exception 'Log in first.'; end if;
  select * into g from groups where id = gid;
  if g.id is null then raise exception 'That group doesn''t exist any more.'; end if;
  if is_blocked_between(g.owner, auth.uid()) then raise exception 'You can''t join this group.'; end if;
  if is_group_member(gid) then return 'member'; end if;
  if g.privacy = 'public' or (code is not null and code = g.invite_code) then
    insert into group_members (group_id, user_id, added_by, role) values (gid, auth.uid(), auth.uid(), 'member') on conflict do nothing;
    delete from group_requests where group_id = gid and user_id = auth.uid();
    insert into notifications (user_id, actor, kind, group_id, data)
    select m.user_id, auth.uid(), 'group_join', gid, jsonb_build_object('name', g.name)
    from group_members m where m.group_id = gid and m.role in ('owner', 'admin') and m.user_id <> auth.uid();
    return 'member';
  elsif g.privacy = 'request' then
    insert into group_requests (group_id, user_id, note) values (gid, auth.uid(), left(nullif(trim(note), ''), 200))
    on conflict (group_id, user_id) do update set note = excluded.note;
    insert into notifications (user_id, actor, kind, group_id, data)
    select m.user_id, auth.uid(), 'group_request', gid, jsonb_build_object('name', g.name, 'note', left(note, 80))
    from group_members m where m.group_id = gid and m.role in ('owner', 'admin');
    return 'requested';
  end if;
  raise exception 'This group is invite-only. Ask a member for the invite link.';
end $$;

create or replace function public.group_by_code(code text) returns bigint
language sql stable security definer set search_path = public as $$
  select id from groups where invite_code = code;
$$;

create or replace function public.respond_group_request(gid bigint, who uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_admin(gid) then raise exception 'Only group admins can do that.'; end if;
  if not exists (select 1 from group_requests where group_id = gid and user_id = who) then return; end if;
  delete from group_requests where group_id = gid and user_id = who;
  if accept then
    insert into group_members (group_id, user_id, added_by, role) values (gid, who, auth.uid(), 'member') on conflict do nothing;
  end if;
end $$;

create or replace function public.set_group_role(gid bigint, who uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_owner(gid) then raise exception 'Only the owner can change roles.'; end if;
  if new_role not in ('admin', 'member') then raise exception 'Unknown role.'; end if;
  update group_members set role = new_role where group_id = gid and user_id = who and role <> 'owner';
end $$;

create or replace function public.update_group(gid bigint, p_name text, p_description text, p_privacy text, p_category text, p_rules text, p_posting text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_admin(gid) then raise exception 'Only group admins can edit the group.'; end if;
  update groups set name = trim(p_name), description = nullif(trim(p_description), ''), privacy = p_privacy,
    category = p_category, rules = nullif(trim(p_rules), ''), posting = p_posting
  where id = gid;
end $$;

create or replace function public.reset_group_invite(gid bigint) returns text
language plpgsql security definer set search_path = public as $$
declare c text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
begin
  if not is_group_admin(gid) then raise exception 'Only group admins can do that.'; end if;
  update groups set invite_code = c where id = gid;
  return c;
end $$;

create or replace function public.pin_group_post(pid bigint, on_off boolean) returns void
language plpgsql security definer set search_path = public as $$
declare gid bigint := (select group_id from group_posts where id = pid);
begin
  if gid is null or not is_group_admin(gid) then raise exception 'Only group admins can pin.'; end if;
  update group_posts set pinned = on_off where id = pid;
end $$;

create or replace function public.set_idea_status(iid bigint, new_status text) returns void
language plpgsql security definer set search_path = public as $$
declare gid bigint := (select group_id from group_ideas where id = iid);
begin
  if gid is null or not is_group_admin(gid) then raise exception 'Only group admins can decide on a pitch.'; end if;
  if new_status not in ('open', 'adopted', 'passed', 'closed') then raise exception 'Unknown status.'; end if;
  update group_ideas set status = new_status where id = iid;
end $$;

-- new pitches and meetings notify the group (one unread per group, like chat)
create or replace function public.trg_group_idea_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor, kind, group_id, data)
  select m.user_id, new.user_id, 'group_idea', new.group_id,
         jsonb_build_object('name', (select name from groups where id = new.group_id), 'symbol', new.symbol, 'stance', new.stance)
  from group_members m where m.group_id = new.group_id and m.user_id <> new.user_id;
  return new;
end $$;
drop trigger if exists group_idea_notify on public.group_ideas;
create trigger group_idea_notify after insert on public.group_ideas for each row execute function public.trg_group_idea_notify();

create or replace function public.trg_group_event_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor, kind, group_id, data)
  select m.user_id, new.created_by, 'group_event', new.group_id,
         jsonb_build_object('name', (select name from groups where id = new.group_id), 'title', new.title, 'starts_at', new.starts_at)
  from group_members m where m.group_id = new.group_id and m.user_id <> new.created_by;
  return new;
end $$;
drop trigger if exists group_event_notify on public.group_events;
create trigger group_event_notify after insert on public.group_events for each row execute function public.trg_group_event_notify();

-- realtime for pitches and votes too
do $$ begin
  alter publication supabase_realtime add table public.group_ideas;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.group_idea_votes;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- ---------- grants ----------
revoke all on function public.is_group_admin(bigint, uuid), public.can_post_in_group(bigint), public.discover_groups(text, text),
  public.join_group(bigint, text, text), public.group_by_code(text), public.respond_group_request(bigint, uuid, boolean),
  public.set_group_role(bigint, uuid, text), public.update_group(bigint, text, text, text, text, text, text),
  public.reset_group_invite(bigint), public.pin_group_post(bigint, boolean), public.set_idea_status(bigint, text) from public, anon;
grant execute on function public.is_group_admin(bigint, uuid), public.can_post_in_group(bigint), public.discover_groups(text, text),
  public.join_group(bigint, text, text), public.group_by_code(text), public.respond_group_request(bigint, uuid, boolean),
  public.set_group_role(bigint, uuid, text), public.update_group(bigint, text, text, text, text, text, text),
  public.reset_group_invite(bigint), public.pin_group_post(bigint, boolean), public.set_idea_status(bigint, text) to authenticated;
