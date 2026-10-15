-- Notify group members when someone posts on the group wall.
create or replace function public.trg_group_post_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor, kind, group_id, data)
  select m.user_id, new.user_id, 'group_post', new.group_id,
         jsonb_build_object('name', (select name from groups where id = new.group_id), 'body', left(new.body, 80))
  from group_members m
  where m.group_id = new.group_id and m.user_id <> new.user_id;
  return new;
end $$;
drop trigger if exists group_post_notify on public.group_posts;
create trigger group_post_notify after insert on public.group_posts
  for each row execute function public.trg_group_post_notify();
