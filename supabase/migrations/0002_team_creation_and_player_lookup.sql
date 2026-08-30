-- 0002_team_creation_and_player_lookup.sql
--
-- Two fixes found while building the registration flow.
--
-- 1. `teams_write_member_or_admin` was unsatisfiable on INSERT. It required an
--    existing `team_members` row for the team being created, but `team_members`
--    has a foreign key to `teams`, so that row cannot exist until the team does.
--    A player could therefore never create a team and every pairing had to be
--    done by an admin.
--
-- 2. There was no way for one player to look another up. `profiles_select_own`
--    hides every other player, so a nickname/handle-based partner invite could
--    not resolve `partner_invites.invitee_id`. The original schema comment
--    anticipated this and asked for a column-whitelisting view rather than
--    relaxing RLS on `profiles` (which holds phone numbers and emergency
--    contacts). That view is added here.


-- ---- 1. allow a player to create their own team -------------------------------
--
-- A player may insert a team when they are party to an *accepted* partner invite
-- in that division which has not yet produced a team. The immediately-following
-- `team_members` insert is still governed by `team_members_write_own_or_admin`,
-- so a player can only ever add themselves.

drop policy if exists "teams_write_member_or_admin" on public.teams;
create policy "teams_write_member_or_admin" on public.teams
  for insert with check (
    public.is_admin()
    or exists (
      select 1
      from public.partner_invites pi
      where pi.division_id = teams.division_id
        and pi.status = 'accepted'
        and pi.resulting_team_id is null
        and (pi.inviter_id = auth.uid() or pi.invitee_id = auth.uid())
    )
  );


-- ---- 2. player lookup without exposing contact details ------------------------
--
-- Column-whitelisting view over `profiles`. Deliberately a security-definer view
-- (the Postgres default) so it can read past `profiles_select_own`; it exposes
-- ONLY non-sensitive identity columns. Phone, emergency contact, gender, skill
-- level and bio are never selected here.
--
-- Granted to `authenticated` only, not `anon`: you must be signed in to look up
-- another player, which is all the partner-invite flow needs.

create or replace view public.player_directory as
  select
    p.id,
    p.full_name,
    p.nickname,
    p.avatar_url
  from public.profiles p
  -- Defence in depth: the REVOKE below is not enough on its own, because
  -- Supabase's default privileges grant `anon` SELECT on objects in `public`,
  -- and any later blanket GRANT would silently re-open this view. The
  -- predicate makes the view return zero rows to an unauthenticated caller
  -- regardless of who holds SELECT.
  where auth.uid() is not null;

comment on view public.player_directory is
  'Column-whitelisted, signed-in-only view of profiles for partner lookup. Never add contact columns here.';

revoke all on public.player_directory from anon, authenticated;
grant select on public.player_directory to authenticated;


-- ---- 3. break the teams <-> team_members RLS recursion ------------------------
--
-- Found by functionally testing fix 1 against a real Postgres: inserting a
-- `team_members` row failed with
--   "infinite recursion detected in policy for relation team_members".
--
-- `teams_select_*` asked "is the caller a member of this team?" by querying
-- `team_members`, whose own SELECT policy asked "is this team's division
-- published?" by querying `teams` — an unbounded cycle. Both directions now go
-- through SECURITY DEFINER helpers that bypass RLS for these two narrow,
-- parameterised membership questions.

create or replace function public.is_team_member(p_team_id uuid, p_player_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.player_id = p_player_id
  );
$$;

create or replace function public.team_division_is_published(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teams t
    join public.divisions d on d.id = t.division_id
    where t.id = p_team_id and d.is_published
  );
$$;

drop policy if exists "teams_select_published_or_member_or_admin" on public.teams;
create policy "teams_select_published_or_member_or_admin" on public.teams
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.divisions d where d.id = teams.division_id and d.is_published
    )
    or public.is_team_member(teams.id)
  );

drop policy if exists "teams_update_member_or_admin" on public.teams;
create policy "teams_update_member_or_admin" on public.teams
  for update using (
    public.is_admin() or public.is_team_member(teams.id)
  ) with check (
    public.is_admin() or public.is_team_member(teams.id)
  );

drop policy if exists "team_members_select_published_or_member_or_admin" on public.team_members;
create policy "team_members_select_published_or_member_or_admin" on public.team_members
  for select using (
    public.is_admin()
    or player_id = auth.uid()
    or public.team_division_is_published(team_members.team_id)
  );


-- ---- 4. the team-size trigger must not be subject to RLS ----------------------
-- Same recursion, reached via the trigger's own COUNT over `team_members`.

create or replace function public.enforce_team_size()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count integer;
begin
  select count(*) into member_count from public.team_members where team_id = new.team_id;
  if member_count > 2 then
    raise exception 'A doubles team cannot have more than 2 members (team_id=%)', new.team_id;
  end if;
  return new;
end;
$$;
