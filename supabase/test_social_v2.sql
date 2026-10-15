-- Self-test for 002_social_feed.sql. Throwaway users; the final RAISE rolls everything back.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  r text := ''; n int; j jsonb; aid bigint; gid bigint; code text; ok boolean;
  procedure_dummy int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 't2a_' || a || '@example.invalid', 'authenticated', 'authenticated'),
    (b, 't2b_' || b || '@example.invalid', 'authenticated', 'authenticated'),
    (c, 't2c_' || c || '@example.invalid', 'authenticated', 'authenticated');
  insert into profiles (id, username, full_name, searchable) values
    (a, 'zz2_alice', 'Zz2 Alice', true), (b, 'zz2_bob', 'Zz2 Bob', true), (c, 'zz2_carol', 'Zz2 Carol', true);
  insert into connections (requester, addressee, status) values (a, b, 'accepted');
  update profiles set share = share || '{"leaderboard":true}' where id = b;
  insert into portfolios (user_id, watchlist) values
    (b, '{"v":1,"watchlist":[{"symbol":"AAPL","status":"owned","buyPrice":100,"qty":10},{"symbol":"NVDA","status":"owned","buyPrice":50,"qty":20},{"symbol":"MSFT","status":"watching"}]}');

  -- Bob posts a buy with a note
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into activity (user_id, kind, symbol, data, note) values (b, 'buy', 'AAPL', '{"price":100,"qty":10}', 'Earnings beat') returning id into aid;
  insert into activity (user_id, kind, symbol, data) values (b, 'poll', 'TSLA', '{"question":"TSLA this month?"}');

  -- Alice (connected)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  j := get_feed();
  r := r || '1.feed_items=' || jsonb_array_length(j) || (case when jsonb_array_length(j) = 2 then ' OK' else ' FAIL' end);
  r := r || ' | 2.qty_visible=' || coalesce(j #>> '{1,data,qty}', 'null') || ' note=' || coalesce(j #>> '{1,note}', 'null');
  insert into activity_reactions (activity_id, user_id, emoji) values (aid, a, '🔥');
  insert into activity_comments (activity_id, user_id, body) values (aid, a, 'Nice call');
  insert into poll_votes (activity_id, user_id, choice) select id, a, 'bull' from activity where kind = 'poll' and user_id = b;
  j := get_feed();
  r := r || ' | 3.reactions=' || (j #> '{1,reactions}')::text || ' comments=' || jsonb_array_length(j #> '{1,comments}') || ' poll_bull=' || (j #>> '{0,poll,bull}');
  j := network_symbols();
  r := r || ' | 4.friend_owned=' || (j #> '{0,owned}')::text;
  j := leaderboard();
  r := r || ' | 5.leaderboard_people=' || jsonb_array_length(j) || ' bob_weights=' ||
       coalesce((select string_agg(round((p ->> 'weight')::numeric, 2)::text, ',') from jsonb_array_elements(j) x, jsonb_array_elements(x -> 'positions') p where (x ->> 'me')::boolean = false), 'none');
  -- groups
  insert into groups (name, owner) values ('Zz2 club', a) returning id into gid;
  insert into group_members (group_id, user_id, added_by) values (gid, b, a);
  begin
    insert into group_members (group_id, user_id, added_by) values (gid, c, a);
    r := r || ' | 6.add_stranger FAIL';
  exception when others then r := r || ' | 6.add_stranger_blocked OK';
  end;
  insert into group_symbols (group_id, symbol, added_by) values (gid, 'SPY', a);
  insert into group_posts (group_id, user_id, body) values (gid, a, 'Welcome!');

  -- Bob: notifications + group
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  j := my_notifications();
  r := r || ' | 7.bob_notifs=' || (select string_agg(x ->> 'kind', ',') from jsonb_array_elements(j) x);
  j := group_detail(gid);
  r := r || ' | 8.bob_group members=' || jsonb_array_length(j -> 'members') || ' symbols=' || jsonb_array_length(j -> 'symbols') || ' posts=' || jsonb_array_length(j -> 'posts');
  code := (select invite_code from profiles where id = b);
  -- Bob hides dollars
  update profiles set share = share || '{"dollars":false}' where id = b;

  -- Carol (stranger)
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  r := r || ' | 9.stranger_feed=' || jsonb_array_length(get_feed()) || (case when jsonb_array_length(get_feed()) = 0 then ' OK' else ' FAIL' end);
  begin
    insert into activity_comments (activity_id, user_id, body) values (aid, c, 'spam');
    r := r || ' | 10.stranger_comment FAIL';
  exception when others then r := r || ' | 10.stranger_comment_blocked OK';
  end;
  ok := group_detail(gid) is null;
  r := r || ' | 11.stranger_group_hidden ' || (case when ok then 'OK' else 'FAIL' end);
  perform accept_invite(code);
  r := r || ' | 12.invite_connected=' || is_connected(b, c);
  j := get_feed();
  r := r || ' | 13.after_invite_feed=' || jsonb_array_length(j) || ' qty_hidden=' || (case when j #>> '{1,data,qty}' is null then 'OK' else 'FAIL' end);
  j := badges(b);
  r := r || ' | 14.bob_badges=' || j::text;

  execute 'reset role';
  raise exception 'TEST RESULTS (rolled back): %', r;
end $$;
