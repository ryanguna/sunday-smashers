-- ===========================================================================
-- 09 — Division capacity is enforced in the database (migration 0015)
--
-- Capacity used to live only in the browser, and the number it checked came
-- from `teams` — rows that only exist once a partner accepts an invite. So
-- through pre-registration every division reported itself empty, and even a
-- correct count could not settle two players submitting at once.
--
-- The trigger downgrades an over-cap entry to 'waitlisted' rather than
-- refusing it, because the waitlist is what overflow is for.
--
-- Runs after 03-08, so this file sets its own cap and clears its own rows.
-- Division `...d2` is capped at one pair (two players) for the duration.
-- ===========================================================================

set role postgres;

update public.divisions set max_teams = 1
where id = '00000000-0000-0000-0000-0000000000d2';

delete from public.registrations
where division_id = '00000000-0000-0000-0000-0000000000d2';

-- Two players fill the one-pair cap.
select public._t(
  'the first entry into a one-pair division is accepted',
  '00000000-0000-0000-0000-0000000000a1',
  $q$insert into public.registrations (tournament_id, division_id, player_id, status)
     values (
       '00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-0000000000d2',
       '00000000-0000-0000-0000-0000000000a1',
       'pending'
     )$q$,
  'allow'
);

select public._t(
  'the second entry fills it',
  '00000000-0000-0000-0000-0000000000a2',
  $q$insert into public.registrations (tournament_id, division_id, player_id, status)
     values (
       '00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-0000000000d2',
       '00000000-0000-0000-0000-0000000000a2',
       'pending'
     )$q$,
  'allow'
);

-- The bug: this used to be saved as an ordinary pending entry, over the cap.
select public._t(
  'the third entry is still saved, not refused',
  '00000000-0000-0000-0000-0000000000a3',
  $q$insert into public.registrations (tournament_id, division_id, player_id, status)
     values (
       '00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-0000000000d2',
       '00000000-0000-0000-0000-0000000000a3',
       'pending'
     )$q$,
  'allow'
);

set role postgres;

do $$
declare
  over_cap public.registration_status;
  taken    integer;
begin
  select status into over_cap
  from public.registrations
  where division_id = '00000000-0000-0000-0000-0000000000d2'
    and player_id = '00000000-0000-0000-0000-0000000000a3';

  if over_cap = 'waitlisted' then
    raise notice '   PASS   [allow] the over-cap entry was downgraded to waitlisted';
  else
    raise notice '**FAIL** [allow] over-cap entry has status % (expected waitlisted)', over_cap;
  end if;

  -- The waitlisted row must not count against the cap, or the first person in
  -- the queue permanently blocks the place they are queued for.
  select registered_players into taken
  from public.division_occupancy
  where division_id = '00000000-0000-0000-0000-0000000000d2';

  if taken = 2 then
    raise notice '   PASS   [allow] division_occupancy counts entries, excluding the waitlist';
  else
    raise notice '**FAIL** [allow] division_occupancy reported % (expected 2)', taken;
  end if;
end $$;

-- The committee overrides caps deliberately.
select public._t(
  'an admin may still enter someone over the cap',
  '00000000-0000-0000-0000-0000000000a0',
  $q$insert into public.registrations (tournament_id, division_id, player_id, status)
     values (
       '00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-0000000000d2',
       '00000000-0000-0000-0000-0000000000a4',
       'pending'
     )$q$,
  'allow'
);

set role postgres;

do $$
declare
  admin_status public.registration_status;
begin
  select status into admin_status
  from public.registrations
  where division_id = '00000000-0000-0000-0000-0000000000d2'
    and player_id = '00000000-0000-0000-0000-0000000000a4';

  if admin_status = 'pending' then
    raise notice '   PASS   [allow] the admin entry was not downgraded';
  else
    raise notice '**FAIL** [allow] admin entry has status % (expected pending)', admin_status;
  end if;
end $$;

-- Anyone may read the counts, including the signed-out registration form.
select public._t(
  'the public may read division occupancy',
  null,
  $q$select division_id from public.division_occupancy$q$,
  'allow'
);

set role postgres;
update public.divisions set max_teams = null
where id = '00000000-0000-0000-0000-0000000000d2';
delete from public.registrations
where division_id = '00000000-0000-0000-0000-0000000000d2';
