-- ===========================================================================
-- 0014 — Let a waitlist entry be recorded as waitlisted
--
-- `decideRegistrationOutcome` returns status 'waitlisted' when the window has
-- closed or the division is full, and the wizard shows the player "You're on
-- the waitlist". But `registrations_insert_own` (migration 0009) permits only
-- status = 'pending', so `submitRegistration` hard-coded 'pending' and left
-- the waitlist intent as prose inside `notes`.
--
-- The result was one value with two homes that disagreed: the player was told
-- they were waitlisted, while the admin queue showed an ordinary pending entry
-- indistinguishable from a normal one. Approving the queue top-to-bottom would
-- silently promote waitlisted players ahead of the cap the waitlist exists to
-- enforce.
--
-- Widening the policy is safe because 'waitlisted' is strictly *less*
-- privileged than 'pending': it is not in the set the draw considers, so a
-- player can gain nothing by choosing it. Everything that mattered about 0009
-- is kept — a player still cannot write 'approved', and still cannot forge
-- `reviewed_by` / `reviewed_at`.
--
-- 0009's C1 attack (self-approval into a closed division) stays blocked; the
-- allowed set simply grows from one harmless value to two.
-- ===========================================================================

drop policy if exists "registrations_insert_own" on public.registrations;
create policy "registrations_insert_own" on public.registrations
  for insert with check (
    public.is_admin()
    or (
      auth.uid() = player_id
      and status in ('pending', 'waitlisted')
      and reviewed_by is null
      and reviewed_at is null
    )
  );

-- The update policy already restricts players to their own *pending* rows.
-- Leave it alone: a waitlisted player must not be able to edit themselves back
-- to pending. Only an admin promotes off the waitlist.
