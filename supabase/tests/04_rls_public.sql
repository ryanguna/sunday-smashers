\pset format unaligned
\pset tuples_only on
delete from team_members where team_id not in ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2');
delete from teams where id not in ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2');
delete from partner_invites;
update profiles set full_name='Alice Aquino', nickname='Ali' where id='00000000-0000-0000-0000-0000000000a1';
update matches set status='completed', score_a=15, score_b=9, winner_team_id='00000000-0000-0000-0000-0000000000e1';

-- C4: dave invites bob; bob accepts via the RPC.
insert into partner_invites (id, division_id, inviter_id, invitee_id, invitee_email, status)
values ('00000000-0000-0000-0000-0000000000cc','00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a2','bob@x.test','pending');

select '--- C4: accepting a partner invite must create a REAL team ---';
do $x$
declare tid uuid; n int; st text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4', true);
  begin
    perform accept_partner_invite('00000000-0000-0000-0000-0000000000cc','Nope');
    raise notice '**FAIL** [deny] the INVITER was able to accept his own invite';
  exception when others then raise notice '  PASS   [deny] inviter cannot accept his own invite (%)', split_part(SQLERRM,E'\n',1);
  end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2', true);
  select accept_partner_invite('00000000-0000-0000-0000-0000000000cc','Jingle Ballers') into tid;
  reset role;
  select count(*) into n from team_members where team_id = tid;
  select status into st from partner_invites where id='00000000-0000-0000-0000-0000000000cc';
  if tid is not null and n = 2 and st = 'accepted' then
    raise notice '  PASS   [allow] invitee accepted -> team % with % members, invite=%', tid, n, st;
  else
    raise notice '**FAIL** [allow] team=% members=% status=%', tid, n, st;
  end if;
  -- idempotency: accepting twice must not create a second team
  set local role authenticated;
  begin
    if accept_partner_invite('00000000-0000-0000-0000-0000000000cc','Again') = tid then
      raise notice '  PASS   [allow] a second accept is idempotent (same team)';
    else raise notice '**FAIL** a second accept created a different team'; end if;
  exception when others then raise notice '  PASS   [deny] a second accept is rejected (%)', split_part(SQLERRM,E'\n',1);
  end;
  reset role;
end $x$;

select '--- H4 / M4 / L1: what the anonymous public can see ---';
do $x$
declare n int; nm text;
begin
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into n from player_directory;
  select full_name into nm from player_directory where id='00000000-0000-0000-0000-0000000000a1';
  if n > 0 and nm = 'Alice Aquino' then raise notice '  PASS   [allow] H4 anon sees % player names via player_directory (e.g. %)', n, nm;
  else raise notice '**FAIL** H4 anon sees no player names (n=%, name=%)', n, nm; end if;

  begin
    select count(*) into n from profiles;
    if n = 0 then raise notice '  PASS   [deny] anon cannot read the profiles table directly (0 rows)';
    else raise notice '**FAIL** anon read % raw profile rows (phone/emergency contact exposed)', n; end if;
  exception when others then raise notice '  PASS   [deny] anon cannot read profiles (%)', split_part(SQLERRM,E'\n',1);
  end;

  select count(*) into n from standings where division_id='00000000-0000-0000-0000-0000000000d1';
  if n > 0 then raise notice '  PASS   [allow] M4 anon sees standings for the PUBLISHED division (% rows)', n;
  else raise notice '**FAIL** M4 anon sees no standings for the published division'; end if;

  select count(*) into n from standings where division_id='00000000-0000-0000-0000-0000000000d2';
  if n = 0 then raise notice '  PASS   [deny] M4 anon sees nothing for the UNPUBLISHED division';
  else raise notice '**FAIL** M4 anon leaked % rows from the unpublished division', n; end if;

  begin
    perform has_role('00000000-0000-0000-0000-0000000000a0','admin');
    raise notice '**FAIL** [deny] L1 anon can still call has_role()';
  exception when others then raise notice '  PASS   [deny] L1 anon cannot call has_role (%)', split_part(SQLERRM,E'\n',1);
  end;
  reset role;
end $x$;
