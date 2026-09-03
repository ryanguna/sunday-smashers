-- ===========================================================================
-- 07 — One payment record per registration (migration 0013)
--
-- Guards the money-reporting bug: `payments` had only an index on
-- `registration_id`, so two organisers saving at once each inserted a row and
-- `computeReconciliation` then double-counted that entry in both the
-- "expected" and "collected" totals.
--
-- Runs after 03-06, which leave their own rows behind, so this file creates
-- everything it needs under ids that no other file uses (`...00c1`).
-- ===========================================================================

set role postgres;

-- Own registration row, so the ordering of the other files cannot affect this.
insert into public.registrations (id, tournament_id, division_id, player_id, status)
values (
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-0000000000f1',
  '00000000-0000-0000-0000-0000000000d1',
  '00000000-0000-0000-0000-0000000000a4',
  'approved'
)
on conflict (division_id, player_id) do update set status = 'approved';

delete from public.payments
where registration_id = '00000000-0000-0000-0000-0000000000c1';

select public._t(
  'admin records the first payment for an entry',
  '00000000-0000-0000-0000-0000000000a0',
  $q$insert into public.payments (registration_id, amount_cents, amount_paid_cents, status)
     values ('00000000-0000-0000-0000-0000000000c1', 2500, 2500, 'paid')$q$,
  'allow'
);

-- The bug: this used to succeed, leaving two rows and doubling the totals.
select public._t(
  'a second payment row for the same entry is refused',
  '00000000-0000-0000-0000-0000000000a0',
  $q$insert into public.payments (registration_id, amount_cents, amount_paid_cents, status)
     values ('00000000-0000-0000-0000-0000000000c1', 2500, 2500, 'paid')$q$,
  'deny'
);

-- The app's fix is an upsert, so the honest case (two admins recording the
-- same cash) must still save rather than erroring.
select public._t(
  'an upsert on the registration still records the payment',
  '00000000-0000-0000-0000-0000000000a0',
  $q$insert into public.payments (registration_id, amount_cents, amount_paid_cents, status)
     values ('00000000-0000-0000-0000-0000000000c1', 2500, 1000, 'partial')
     on conflict (registration_id) do update
       set amount_paid_cents = excluded.amount_paid_cents,
           status = excluded.status$q$,
  'allow'
);

set role postgres;

-- The whole point: exactly one row survives, so the totals cannot double.
select case
  when count(*) = 1 then '  PASS   [allow] exactly one payment row survives for the entry'
  else '**FAIL** [allow] exactly one payment row survives for the entry  (rows=' || count(*) || ')'
end
from public.payments
where registration_id = '00000000-0000-0000-0000-0000000000c1';

-- And the upsert updated in place rather than adding a row.
select case
  when count(*) = 1 then '  PASS   [allow] the upsert updated the existing row in place'
  else '**FAIL** [allow] the upsert updated the existing row in place  (rows=' || count(*) || ')'
end
from public.payments
where registration_id = '00000000-0000-0000-0000-0000000000c1'
  and amount_paid_cents = 1000
  and status = 'partial';
