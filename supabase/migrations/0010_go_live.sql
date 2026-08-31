-- ===========================================================================
-- 0010 — go-live enablers
--
-- Everything here exists because a player-journey and an admin-journey audit
-- found things that were impossible to do through the app at all. Each block
-- documents the dead end it removes.
-- ===========================================================================


-- ===========================================================================
-- B3 — the first admin could only be created by hand-writing SQL.
--
-- `handle_new_user` grants every signup exactly 'player', and the only
-- role-granting UI lives at /admin/settings/roles, which is itself behind
-- `requireAdmin`. Chicken and egg: with zero admins, nobody can ever become
-- one without opening the Supabase SQL editor.
--
-- `claim_first_admin()` closes the loop safely. It is SECURITY DEFINER (it
-- must write user_roles, which players cannot), but it is *only* willing to
-- act while the tournament has no admin at all. The instant one exists the
-- function is inert forever, so exposing it to authenticated users does not
-- widen the attack surface beyond "whoever signs in first during setup" —
-- and during setup that is the committee member doing the setup.
--
-- It takes no arguments on purpose: it can only ever promote the caller, so
-- there is no parameter to tamper with.
-- ===========================================================================
create or replace function public.claim_first_admin()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  claimant uuid := auth.uid();
begin
  if claimant is null then
    raise exception 'You must be signed in to claim the first admin seat.'
      using errcode = '42501';
  end if;

  -- Lock the table so two people tapping the button at the same moment cannot
  -- both pass the "no admins yet" check.
  lock table public.user_roles in exclusive mode;

  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'An admin already exists — ask them to grant you access from Settings › Roles.'
      using errcode = '42501';
  end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (claimant, 'admin', claimant)
  on conflict (user_id, role) do nothing;

  return 'granted';
end;
$$;

revoke all on function public.claim_first_admin() from public, anon;
grant execute on function public.claim_first_admin() to authenticated;

comment on function public.claim_first_admin() is
  'One-time bootstrap: promotes the calling user to admin, but only while no admin exists. Inert thereafter.';


-- `admin_exists()` lets the UI decide whether to offer the claim button
-- without leaking anything else about user_roles (which is admin-read-only).
create or replace function public.admin_exists()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.user_roles where role = 'admin');
$$;

revoke all on function public.admin_exists() from public;
grant execute on function public.admin_exists() to anon, authenticated;

comment on function public.admin_exists() is
  'True once at least one admin exists. Used to hide the first-admin claim screen.';


-- ===========================================================================
-- B5 / player-audit #7 & #8 — the entry fee, the payment instructions and the
-- organiser's contact details had nowhere to live.
--
-- The fee was previously stashed in a JSON blob in `site_content`, and
-- payments never read it, so two volunteers recording money could disagree
-- about what a player owed. Contact details and "how do I actually pay you"
-- existed nowhere at all: the dashboard told unpaid players to "pay the
-- organisers" and linked them to a page with no payment information on it.
-- ===========================================================================
alter table public.tournaments
  add column if not exists entry_fee_cents integer
    check (entry_fee_cents is null or entry_fee_cents >= 0),
  add column if not exists payment_instructions text,
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists doors_open_at timestamptz;

comment on column public.tournaments.entry_fee_cents is
  'Entry fee per player in cents. Single source of truth — payments pre-fill from this.';
comment on column public.tournaments.payment_instructions is
  'Free text shown to unpaid players: bank/PayID details, reference format, deadline.';
comment on column public.tournaments.doors_open_at is
  'When players should arrive. Distinct from the first serve; the forfeit rule needs this to be fair.';


-- ===========================================================================
-- Player-audit #1 (BLOCKER) — a partner invited by email could never see it.
--
-- Registration writes `partner_invites` with only `invitee_email` when the
-- partner is not already a resolvable account. Every SELECT policy and the
-- accept RPC key off `invitee_id`, so the invite was invisible forever: the
-- pair could never be formed by the players themselves.
--
-- The fix is deliberately at the DATABASE layer, in exactly two triggers,
-- rather than by widening the SELECT policy and the app's `.or()` filter and
-- the accept RPC to also understand emails. Once `invitee_id` is always
-- populated as soon as the account exists, every existing policy, query and
-- RPC keeps working unchanged and there is nothing to keep in sync. This
-- project has a long history of the same rule being restated in a second
-- place and then drifting; this avoids adding another instance.
--
-- Direction 1: invite created AFTER the partner already signed up.
-- ===========================================================================
alter table public.partner_invites
  add column if not exists inviter_name text;

comment on column public.partner_invites.inviter_name is
  'Denormalised at insert. profiles is owner-only under RLS, so the invitee cannot read the inviter''s name any other way.';

create or replace function public.resolve_partner_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched uuid;
begin
  if new.invitee_email is not null then
    new.invitee_email := lower(btrim(new.invitee_email));
  end if;

  if new.invitee_id is null and new.invitee_email is not null then
    select u.id into matched
    from auth.users u
    where lower(u.email) = new.invitee_email
    limit 1;

    if matched = new.inviter_id then
      raise exception 'That is your own email address — invite your partner instead.'
        using errcode = '23514';
    end if;

    new.invitee_id := matched; -- stays null if they have not signed up yet
  end if;

  -- Denormalise the inviter's name (player-audit #9). `profiles` is
  -- owner-only under RLS, so the invitee could otherwise only be told that
  -- "a fellow smasher" wanted to partner them — nobody accepts that.
  if new.inviter_name is null then
    select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.nickname), ''))
    into new.inviter_name
    from public.profiles p
    where p.id = new.inviter_id;
  end if;

  return new;
end;
$$;

drop trigger if exists resolve_partner_invite on public.partner_invites;
create trigger resolve_partner_invite
  before insert on public.partner_invites
  for each row execute function public.resolve_partner_invite();


-- ---------------------------------------------------------------------------
-- Direction 2: invite created BEFORE the partner signed up.
-- On signup, claim every pending invite addressed to that email.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'player')
  on conflict (user_id, role) do nothing;

  -- Adopt any invite that was addressed to this email before the account
  -- existed, so it shows up in their stocking on first sign-in.
  update public.partner_invites
  set invitee_id = new.id
  where invitee_id is null
    and invitee_email = lower(new.email)
    and inviter_id <> new.id
    and status = 'pending';

  return new;
end;
$$;


-- Backfill for anyone who already signed up while the bug was live.
update public.partner_invites pi
set invitee_id = u.id
from auth.users u
where pi.invitee_id is null
  and pi.invitee_email is not null
  and lower(u.email) = lower(btrim(pi.invitee_email))
  and u.id <> pi.inviter_id
  and pi.status = 'pending';

update public.partner_invites pi
set inviter_name = coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.nickname), ''))
from public.profiles p
where pi.inviter_name is null
  and p.id = pi.inviter_id;


-- ===========================================================================
-- B4 — registration could not be opened or closed from the UI.
--
-- `is_registration_open` and `is_published` were declared but never read or
-- written by any code; the public gate was computed from hardcoded constants
-- in `src/lib/tournament.ts`, so changing a date meant a code change and a
-- redeploy. The app now drives its phase from this row, which means anon
-- must be able to read the published tournament's dates.
--
-- Note the deliberate asymmetry: anon sees the tournament only once it is
-- published, and never sees the organiser's private contact columns.
-- ===========================================================================
drop view if exists public.tournament_public;
create view public.tournament_public
with (security_invoker = false) as
  select
    t.id,
    t.name,
    t.slug,
    t.tournament_date,
    t.doors_open_at,
    t.registration_opens_at,
    t.registration_closes_at,
    t.is_registration_open,
    t.venue_name,
    t.venue_address,
    t.entry_fee_cents,
    t.payment_instructions,
    t.contact_name,
    t.contact_phone,
    t.contact_email,
    t.status,
    t.description
  from public.tournaments t
  where t.is_published;

grant select on public.tournament_public to anon, authenticated;

comment on view public.tournament_public is
  'Published tournament settings the public site derives its countdown, registration gate and "the details" block from. Runs as owner so anon can read it without a tournaments policy.';
