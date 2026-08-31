-- 0010 go-live surfaces: the first-admin bootstrap, invite-by-email resolution
-- and the public tournament view. The bootstrap function is SECURITY DEFINER
-- and writes user_roles, so it gets the most attention here.
\pset format unaligned
\pset tuples_only on

select '--- B3: the first-admin bootstrap ---';
do $x$
declare n int; ok boolean;
begin
  -- The fixture already has an admin, so the claim must be refused outright.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4', true);
  begin
    perform claim_first_admin();
    raise notice '**FAIL** [deny] dave claimed admin while an admin already existed';
  exception when others then
    raise notice '  PASS   [deny] claim refused while an admin exists (%)', split_part(SQLERRM,E'\n',1);
  end;
  reset role;

  -- anon must not even be able to reach the function.
  set local role anon;
  perform set_config('request.jwt.claim.sub','', true);
  begin
    perform claim_first_admin();
    raise notice '**FAIL** [deny] anon executed claim_first_admin()';
  exception when others then
    raise notice '  PASS   [deny] anon cannot execute claim_first_admin (%)', split_part(SQLERRM,E'\n',1);
  end;
  select admin_exists() into ok;
  if ok then raise notice '  PASS   [allow] anon can read admin_exists() = true (drives the setup screen)';
  else raise notice '**FAIL** admin_exists() said false while an admin exists'; end if;
  reset role;
end $x$;

-- Now the genuine day-zero case: no admin in the system at all.
create temp table _saved_admins as select * from user_roles where role='admin';
delete from user_roles where role='admin';

do $x$
declare n int; ok boolean;
begin
  set local role anon;
  select admin_exists() into ok;
  if not ok then raise notice '  PASS   [allow] admin_exists() = false on an empty system';
  else raise notice '**FAIL** admin_exists() said true with no admins'; end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4', true);
  perform claim_first_admin();
  reset role;
  select count(*) into n from user_roles where role='admin' and user_id='00000000-0000-0000-0000-0000000000a4';
  if n = 1 then raise notice '  PASS   [allow] B3 dave claimed the first admin seat on an empty system';
  else raise notice '**FAIL** B3 the first-admin claim did not grant the role (n=%)', n; end if;

  -- ...and the door must close immediately behind him.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2', true);
  begin
    perform claim_first_admin();
    raise notice '**FAIL** [deny] bob ALSO claimed admin after dave already had it';
  exception when others then
    raise notice '  PASS   [deny] the claim is inert once the first admin exists (%)', split_part(SQLERRM,E'\n',1);
  end;
  reset role;
end $x$;

delete from user_roles where role='admin';
insert into user_roles select * from _saved_admins;

select '--- Player-audit #1: an invite addressed to an email must reach that player ---';
delete from partner_invites;
update profiles set full_name='Alice Aquino' where id='00000000-0000-0000-0000-0000000000a1';

do $x$
declare iid uuid; nm text; n int;
begin
  -- Direction 1: the partner ALREADY has an account. invitee_id must be
  -- resolved at insert time, even though the app only supplied an email.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1', true);
  insert into partner_invites (division_id, inviter_id, invitee_email, status)
  values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','  BOB@x.test ','pending')
  returning id into iid;
  reset role;

  if (select invitee_id from partner_invites where id=iid) = '00000000-0000-0000-0000-0000000000a2' then
    raise notice '  PASS   [allow] an emailed invite resolved to the existing account (case/space insensitive)';
  else raise notice '**FAIL** invitee_id was not resolved from the email'; end if;

  select inviter_name into nm from partner_invites where id=iid;
  if nm = 'Alice Aquino' then raise notice '  PASS   [allow] #9 the inviter''s name is denormalised (%), not "a fellow smasher"', nm;
  else raise notice '**FAIL** #9 inviter_name was not captured (got %)', nm; end if;

  -- ...and bob can actually SEE it, which was the blocker.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2', true);
  select count(*) into n from partner_invites where id = iid;
  reset role;
  if n = 1 then raise notice '  PASS   [allow] the invited player can see the invite in their stocking';
  else raise notice '**FAIL** the invited player still cannot see the invite'; end if;

  -- Inviting yourself must be refused with a readable message.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1', true);
  begin
    insert into partner_invites (division_id, inviter_id, invitee_email, status)
    values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','alice@x.test','pending');
    raise notice '**FAIL** [deny] alice invited herself';
  exception when others then
    raise notice '  PASS   [deny] self-invite by email is refused (%)', split_part(SQLERRM,E'\n',1);
  end;
  reset role;
end $x$;

do $x$
declare iid uuid; n int;
begin
  -- Direction 2: the partner has NOT signed up yet. The invite is parked with
  -- a null invitee_id and must be adopted the moment they create an account.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1', true);
  insert into partner_invites (division_id, inviter_id, invitee_email, status)
  values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','newcomer@x.test','pending')
  returning id into iid;
  reset role;

  if (select invitee_id from partner_invites where id=iid) is null then
    raise notice '  PASS   [allow] an invite to a stranger is parked with no invitee_id';
  else raise notice '**FAIL** invitee_id was invented for an account that does not exist'; end if;

  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a7','Newcomer@X.test');

  if (select invitee_id from partner_invites where id=iid) = '00000000-0000-0000-0000-0000000000a7' then
    raise notice '  PASS   [allow] #1 signing up adopted the waiting invite — the pair can now form';
  else raise notice '**FAIL** #1 the invite is STILL orphaned after the partner signed up'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a7', true);
  select count(*) into n from partner_invites where id = iid;
  reset role;
  if n = 1 then raise notice '  PASS   [allow] the newcomer sees the invite on first sign-in';
  else raise notice '**FAIL** the newcomer still sees an empty stocking'; end if;
end $x$;

select '--- B4: the public tournament view drives the registration gate ---';
do $x$
declare n int; fee int;
begin
  update tournaments set entry_fee_cents = 2500, contact_name='Committee', is_published = true
   where id='00000000-0000-0000-0000-0000000000f1';

  set local role anon;
  perform set_config('request.jwt.claim.sub','', true);
  select count(*) into n from tournament_public;
  select entry_fee_cents into fee from tournament_public where id='00000000-0000-0000-0000-0000000000f1';
  if n = 1 and fee = 2500 then raise notice '  PASS   [allow] anon reads the published tournament dates + fee (%c)', fee;
  else raise notice '**FAIL** anon could not read the published tournament (n=%, fee=%)', n, fee; end if;
  reset role;

  update tournaments set is_published = false where id='00000000-0000-0000-0000-0000000000f1';
  set local role anon;
  select count(*) into n from tournament_public;
  if n = 0 then raise notice '  PASS   [deny] an UNPUBLISHED tournament is invisible to anon';
  else raise notice '**FAIL** an unpublished tournament leaked to anon (% rows)', n; end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2', true);
  begin
    update tournaments set entry_fee_cents = 0 where id='00000000-0000-0000-0000-0000000000f1';
    get diagnostics n = ROW_COUNT;
    if n = 0 then raise notice '  PASS   [deny] a player cannot rewrite the entry fee (0 rows)';
    else raise notice '**FAIL** a player rewrote the entry fee (% rows)', n; end if;
  exception when others then
    raise notice '  PASS   [deny] a player cannot rewrite the entry fee (%)', split_part(SQLERRM,E'\n',1);
  end;
  reset role;
  update tournaments set is_published = true where id='00000000-0000-0000-0000-0000000000f1';
end $x$;
