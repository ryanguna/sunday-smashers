-- ===========================================================================
-- 0016 — Close the last three gaps the audit found on the write path
--
-- All three are the same shape as 0015: a rule the application states clearly
-- and the database has no opinion about. Anyone holding the anon key — which
-- ships in the browser bundle by design — can talk to PostgREST directly, so
-- a rule that lives only in a React component is a rule that does not exist.
--
--   R1. The registration *window*. Migration 0015 taught the database about
--       capacity but not about time, so between now and the day entries open
--       a direct insert lands as an ordinary 'pending' row and joins the
--       admin queue looking exactly like a legitimate one.
--
--   R2. `reviewed_by` / `reviewed_at` on UPDATE. The INSERT policy has pinned
--       both to null since 0009, but the UPDATE policy's WITH CHECK never
--       did, so a player could edit their own pending row and stamp it as
--       reviewed by an organiser who never saw it. It does not grant
--       'approved' — that is still refused — but it forges the audit trail
--       the committee reads when deciding.
--
--   R3. `site_page_visibility` was the one public table without
--       `force row level security`. Its policies are correct; the table just
--       did not carry the belt-and-braces flag every other table has, so a
--       future definer-owned helper touching it would bypass them silently.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- R1 — the registration window, enforced where the clock is trusted
--
-- Deliberately mirrors `enforce_division_capacity` (0015) rather than being a
-- policy: a WITH CHECK failure is a bare 42501 with no useful message, and
-- this needs to explain itself. Admins are exempt because the committee adds
-- late entries by hand, which is exactly the case a hard policy would block.
--
-- The rule matches `applyOrganiserSwitch()` in `src/lib/registration.ts`
-- exactly, and the direction matters: `is_registration_open` is an *override*
-- of the calendar, not an extra condition on top of it. The organisers use it
-- to open the sheet early, and turning it off while the window is open only
-- pauses the form into waitlist mode — it does not stop submissions. So an
-- entry is allowed when the switch is on **or** the clock is inside the
-- window, and refused only when neither is true. Requiring both would mean a
-- committee that forgot to tick "Accept entries" silently locked every player
-- out on opening day.
--
-- Reads the window from the *division's own* tournament, so a second
-- tournament in the same project cannot be gated by the wrong dates.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_registration_window()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  opens_at timestamptz;
  closes_at timestamptz;
  switch_on boolean;
begin
  if public.is_admin() then
    return new;
  end if;

  select t.registration_opens_at, t.registration_closes_at, t.is_registration_open
    into opens_at, closes_at, switch_on
  from public.divisions d
  join public.tournaments t on t.id = d.tournament_id
  where d.id = new.division_id;

  -- No division, or no tournament behind it: leave the verdict to the foreign
  -- keys rather than inventing one here.
  if not found then
    return new;
  end if;

  if switch_on then
    return new;
  end if;

  if now() < opens_at then
    raise exception
      'Registration has not opened yet. The sheet opens on %.',
      to_char(opens_at, 'FMDD FMMonth YYYY')
      using errcode = 'check_violation';
  end if;

  if closes_at is not null and now() > closes_at then
    raise exception
      'Registration closed on %. Ask an organiser if you need a late entry.',
      to_char(closes_at, 'FMDD FMMonth YYYY')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_registration_window() is
  'Refuses entries outside the tournament registration window unless is_registration_open overrides it. Admins are exempt so the committee can add late entries.';

-- Postgres fires same-timing triggers in name order, so `enforce_division_
-- capacity` runs first and may downgrade the row to 'waitlisted'. That is
-- harmless: this trigger raises regardless of status, so a closed window still
-- wins over a waitlist place. Nothing is written either way — both are BEFORE
-- INSERT.
drop trigger if exists enforce_registration_window on public.registrations;
create trigger enforce_registration_window
  before insert on public.registrations
  for each row execute function public.enforce_registration_window();


-- ---------------------------------------------------------------------------
-- R2 — a player may edit their own pending entry, but not sign off on it
--
-- Rewritten in full because `create policy` has no ALTER for WITH CHECK. USING
-- and the `status = 'pending'` pin are unchanged; the WITH CHECK half gains
-- the same two `reviewed_*` pins the INSERT policy has carried since 0009.
-- Without them a player could PATCH their own row and stamp it as reviewed by
-- an organiser who never saw it. It never granted 'approved' — that stays
-- refused — but it forged the audit trail the committee decides from.
-- ---------------------------------------------------------------------------
drop policy if exists "registrations_update_own_pending_or_admin" on public.registrations;
create policy "registrations_update_own_pending_or_admin" on public.registrations
  for update
  using (
    public.is_admin()
    or (auth.uid() = player_id and status = 'pending')
  )
  with check (
    public.is_admin()
    or (
      auth.uid() = player_id
      and status = 'pending'
      and reviewed_by is null
      and reviewed_at is null
    )
  );


-- ---------------------------------------------------------------------------
-- R3 — the one table missing the flag
-- ---------------------------------------------------------------------------
alter table public.site_page_visibility force row level security;
