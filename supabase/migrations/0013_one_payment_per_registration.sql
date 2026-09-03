-- ===========================================================================
-- 0013 — One payment record per registration
--
-- `payments` carried only `idx_payments_registration_id`, an index, never a
-- unique constraint. The admin console treats payment as a single record per
-- entry: `updatePaymentAction` updates when it was handed a `paymentId` and
-- inserts when it wasn't. Two organisers with the console open — or one with a
-- stale tab that loaded before the first payment existed — therefore both take
-- the insert branch and create two rows for the same registration.
--
-- Nothing then reconciles them: `computeReconciliation` sums `amount_cents`
-- and `amount_paid_cents` across payment rows, so the committee's "collected"
-- and "expected" totals both double for that player. Money reporting being
-- quietly wrong is worse than a save failing.
--
-- The unique constraint makes the second insert fail loudly, and the matching
-- change in `updatePaymentAction` turns it into an upsert so the honest case
-- (two admins recording the same cash payment) still saves.
-- ===========================================================================

-- Collapse any duplicates that already exist before the constraint is added,
-- keeping the most recently updated row for each registration. Written to be
-- safely re-runnable.
delete from public.payments p
where exists (
  select 1
  from public.payments keep
  where keep.registration_id = p.registration_id
    and (keep.updated_at, keep.id) > (p.updated_at, p.id)
);

alter table public.payments
  drop constraint if exists uq_payments_registration;

alter table public.payments
  add constraint uq_payments_registration unique (registration_id);

comment on constraint uq_payments_registration on public.payments is
  'One payment record per registration. Without this, two admins saving at once each insert a row and the reconciliation totals double-count that entry.';
