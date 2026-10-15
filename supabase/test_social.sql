-- Self-test for 001_social.sql. Creates throwaway users inside one transaction,
-- checks the security rules, then ALWAYS rolls back (the final RAISE undoes everything).
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  r text := ''; n int; j jsonb; ok boolean;
  procedure_dummy int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'test_a_' || a || '@example.invalid', 'authenticated', 'authenticated'),
    (b, 'test_b_' || b || '@example.invalid', 'authenticated', 'authenticated'),
    (c, 'test_c_' || c || '@example.invalid', 'authenticated', 'authenticated');
  insert into profiles (id, username, full_name, searchable, school, company, sectors) values
    (a, 'zz_test_alice', 'Zz Test Alice', true, 'Test Uni', null, '{Tech}'),
    (b, 'zz_test_bob', 'Zz Test Bob', true, 'Test Uni', 'Acme', '{Tech,Energy}'),
    (c, 'zz_test_carol', 'Zz Test Carol', false, null, null, '{}');
  update profiles set visibility = '{"company":"private","school":"connections"}' where id = b;
  insert into portfolios (user_id, watchlist) values
    (b, '{"v":1,"watchlist":[{"symbol":"AAPL","status":"owned","buyPrice":100,"qty":10},{"symbol":"MSFT","status":"watching"}],"alerts":[{"symbol":"AAPL"}],"transactions":[{"symbol":"NVDA","realizedUsd":50}]}');

  -- act as Alice
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from profiles where id = b;            r := r || ' 1.direct_profile_read=' || n || (case when n = 0 then ' OK' else ' FAIL' end);
  select count(*) into n from portfolios where user_id = b;     r := r || ' | 2.direct_portfolio_read=' || n || (case when n = 0 then ' OK' else ' FAIL' end);
  j := search_profiles('zz_test');                               r := r || ' | 3.search_count=' || jsonb_array_length(j) || (case when jsonb_array_length(j) = 1 then ' OK' else ' FAIL' end);
  ok := get_profile(c) is null;                                  r := r || ' | 4.hidden_profile ' || (case when ok then 'OK' else 'FAIL' end);
  j := get_profile(b);
  r := r || ' | 5.stranger_sees_school=' || (j ? 'school') || ' company=' || (j ? 'company') || (case when not (j ? 'school') and not (j ? 'company') then ' OK' else ' FAIL' end);
  ok := get_shared_portfolio(b) is null;                         r := r || ' | 6.portfolio_before_connect ' || (case when ok then 'OK' else 'FAIL' end);
  r := r || ' | 7.suggested=' || jsonb_array_length(suggested_profiles());

  insert into connections (requester, addressee, note) values (a, b, 'hi');
  update connections set status = 'accepted' where requester = a and addressee = b;
  get diagnostics n = row_count;                                 r := r || ' | 8.requester_self_accept_rows=' || n || (case when n = 0 then ' OK' else ' FAIL' end);
  begin
    insert into connections (requester, addressee) values (b, c);
    r := r || ' | 9.spoof_request FAIL';
  exception when others then r := r || ' | 9.spoof_request_blocked OK';
  end;

  -- act as Bob: accept
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  r := r || ' | 10.bob_incoming=' || jsonb_array_length(my_network() -> 'incoming');
  update connections set status = 'accepted' where requester = a and addressee = b;
  get diagnostics n = row_count;                                 r := r || ' | 11.accept_rows=' || n || (case when n = 1 then ' OK' else ' FAIL' end);

  -- back to Alice
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  j := get_profile(b);
  r := r || ' | 12.connected_sees_school=' || (j ? 'school') || ' company=' || (j ? 'company') || (case when (j ? 'school') and not (j ? 'company') then ' OK' else ' FAIL' end);
  j := get_shared_portfolio(b);
  r := r || ' | 13.owned_qty=' || coalesce(j #>> '{owned,0,qty}', 'null') || ' watch=' || jsonb_array_length(j -> 'watchlist')
         || ' tx=' || jsonb_array_length(j -> 'transactions') || ' alerts_hidden=' || (not (j ? 'alerts'))
         || (case when j #>> '{owned,0,qty}' = '10' and not (j ? 'alerts') then ' OK' else ' FAIL' end);
  r := r || ' | 14.counts owned=' || (get_profile(b) ->> 'owned_count') || ' conns=' || (get_profile(b) ->> 'connection_count');

  -- Bob hides dollars
  execute 'reset role';
  update profiles set share = share || '{"dollars":false,"realized":false}' where id = b;
  execute 'set local role authenticated';
  j := get_shared_portfolio(b);
  r := r || ' | 15.dollars_hidden qty=' || coalesce(j #>> '{owned,0,qty}', 'null') || ' tx=' || (j ? 'transactions')
         || (case when j #>> '{owned,0,qty}' is null and not (j ? 'transactions') then ' OK' else ' FAIL' end);

  -- Alice blocks Bob
  insert into blocks (blocker, blocked) values (a, b);
  ok := get_shared_portfolio(b) is null and get_profile(b) is null and jsonb_array_length(search_profiles('zz_test_bob')) = 0;
  r := r || ' | 16.block_hides_all ' || (case when ok then 'OK' else 'FAIL' end);

  -- Carol (no accept) and username check
  r := r || ' | 17.username_taken=' || (not username_available('ZZ_TEST_BOB'));

  execute 'reset role';
  raise exception 'TEST RESULTS (rolled back): %', r;
end $$;
