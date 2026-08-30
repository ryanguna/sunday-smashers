-- 0007 — mirror the account email onto `profiles`
--
-- WHY
-- Three separate features independently hit the same wall: player email lives
-- in `auth.users`, which is not readable with the anon key and not joinable
-- from PostgREST. The consequences were real, not cosmetic:
--
--   * the admin registrations CSV export — the tool an organiser actually uses
--     to email everyone about start times — could not include an address;
--   * `RolesManager` had to render the literal string
--     "Email hidden — lives in Supabase auth" where a contact should be;
--   * partner invites by email had no way to show who an address resolved to.
--
-- This mirrors the address onto `public.profiles`, which is already
-- own-or-admin under RLS (`profiles_select_own`), so nothing becomes public.
-- `player_directory` whitelists columns explicitly and is untouched, so the
-- signed-in partner-lookup view still cannot see an address.
--
-- AUTHORITY
-- `auth.users.email` stays the single source of truth. The column here is a
-- read-only mirror kept in step by triggers. That distinction matters: if a
-- player could edit `profiles.email` directly they could point it at an
-- address they do not control, and the organiser's export would then quietly
-- disagree with the address the account actually signs in with. Contact
-- details that lie are worse than contact details that are missing.

alter table public.profiles
  add column if not exists email text;

comment on column public.profiles.email is
  'Read-only mirror of auth.users.email, maintained by trigger. Never write this directly — change the auth user instead. Admin/own visibility only.';

-- -----------------------------------------------------------------------------
-- Write guard
-- -----------------------------------------------------------------------------
-- Column-level GRANTs were the obvious tool here and are the wrong one: to
-- revoke a single column you must drop the table-level UPDATE grant and
-- re-grant every remaining column by name, which silently fails open every
-- time someone later adds a column and forgets the grant list.
--
-- Instead the column is guarded by a trigger, and the two legitimate writers
-- announce themselves with a transaction-local GUC. Anything else — an admin,
-- a player editing their own profile, a stray PostgREST PATCH — has its change
-- to `email` silently reverted rather than rejected, so an unrelated profile
-- update still succeeds.

create or replace function public.guard_profile_email()
returns trigger
language plpgsql
as $$
begin
  if new.email is distinct from old.email
     and coalesce(current_setting('app.sync_profile_email', true), 'off') <> 'on'
  then
    new.email := old.email;
  end if;
  return new;
end;
$$;

comment on function public.guard_profile_email() is
  'Reverts direct writes to profiles.email. Only the auth.users sync triggers, which set app.sync_profile_email, may change it.';

drop trigger if exists guard_profile_email on public.profiles;
create trigger guard_profile_email before update on public.profiles
  for each row execute function public.guard_profile_email();

-- -----------------------------------------------------------------------------
-- Keep the mirror in step
-- -----------------------------------------------------------------------------

-- Signup: populate the address at the same moment the profile row is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The INSERT path is not covered by guard_profile_email (which is an UPDATE
  -- trigger), so no GUC is needed here.
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

  return new;
end;
$$;

-- Email change: a player who updates their address in account settings must
-- not leave the organiser's export pointing at the old one.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Transaction-local, so it cannot leak into another statement on this
  -- connection and cannot be observed by a concurrent session.
  perform set_config('app.sync_profile_email', 'on', true);

  update public.profiles
     set email = new.email
   where id = new.id;

  perform set_config('app.sync_profile_email', 'off', true);
  return new;
end;
$$;

comment on function public.sync_profile_email() is
  'Mirrors an auth.users email change onto profiles. auth.users remains the source of truth.';

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

-- -----------------------------------------------------------------------------
-- Backfill
-- -----------------------------------------------------------------------------
-- Existing rows predate the column. Runs as the migration owner, so it is not
-- subject to RLS, but it *is* subject to the guard trigger above — hence the
-- explicit GUC.

do $$
begin
  perform set_config('app.sync_profile_email', 'on', true);

  update public.profiles p
     set email = u.email
    from auth.users u
   where u.id = p.id
     and p.email is distinct from u.email;

  perform set_config('app.sync_profile_email', 'off', true);
end;
$$;
