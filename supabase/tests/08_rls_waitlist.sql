-- ===========================================================================
-- 08 — A player may record a waitlist entry (migration 0014)
--
-- `decideRegistrationOutcome` returns 'waitlisted' when the window has closed
-- or the division is full, and the wizard tells the player so. But
-- `registrations_insert_own` (migration 0009) allowed only 'pending', so the
-- app hard-coded 'pending' and the committee saw an ordinary entry.
--
-- These checks pin both halves: 'waitlisted' is now writable, and everything
-- 0009 was protecting is still refused.
--
-- Runs after 03-07, which leave their own rows behind, so this file clears the
-- ids it uses first. Carol (`...a3`) is the subject; division `...d2`.
-- ===========================================================================

set role postgres;

delete from public.registrations
where player_id in (
  '00000000-0000-0000-0000-0000000000a3',
  '00000000-0000-0000-0000-0000000000a4'
);

-- The fix: this used to fail, which is why the app wrote 'pending' instead.
select public._t(
  'a player may record their own waitlist entry',
  '00000000-0000-0000-0000-0000000000a3',
  $q$insert into public.registrations (tournament_id, division_id, player_id, status)
     values (
       '00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-0000000000d2',
       '00000000-0000-0000-0000-0000000000a3',
       'waitlisted'
     )$q$,
  'allow'
);

select public._t(
  'a player may still record an ordinary pending entry',
  '00000000-0000-0000-0000-0000000000a4',
  $q$insert into public.registrations (tournament_id, division_id, player_id, status)
     values (
       '00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-0000000000d2',
       '00000000-0000-0000-0000-0000000000a4',
       'pending'
     )$q$,
  'allow'
);

-- 0009's C1 attack, re-checked: widening the allowed set must not have let
-- self-approval back in.
select public._t(
  'a player still cannot approve their own entry',
  '00000000-0000-0000-0000-0000000000a3',
  $q$insert into public.registrations (tournament_id, division_id, player_id, status)
     values (
       '00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-0000000000d1',
       '00000000-0000-0000-0000-0000000000a3',
       'approved'
     )$q$,
  'deny'
);

select public._t(
  'a player still cannot forge a reviewer',
  '00000000-0000-0000-0000-0000000000a3',
  $q$insert into public.registrations (tournament_id, division_id, player_id, status, reviewed_by)
     values (
       '00000000-0000-0000-0000-0000000000f1',
       '00000000-0000-0000-0000-0000000000d1',
       '00000000-0000-0000-0000-0000000000a3',
       'waitlisted',
       '00000000-0000-0000-0000-0000000000a0'
     )$q$,
  'deny'
);

-- A waitlisted player must not be able to promote themselves: the update
-- policy covers own *pending* rows only, and 0014 deliberately left it alone.
select public._t(
  'a waitlisted player cannot move themselves to pending',
  '00000000-0000-0000-0000-0000000000a3',
  $q$update public.registrations set status = 'pending'
     where player_id = '00000000-0000-0000-0000-0000000000a3'
       and division_id = '00000000-0000-0000-0000-0000000000d2'$q$,
  'deny'
);

set role postgres;
delete from public.registrations
where player_id in (
  '00000000-0000-0000-0000-0000000000a3',
  '00000000-0000-0000-0000-0000000000a4'
);
