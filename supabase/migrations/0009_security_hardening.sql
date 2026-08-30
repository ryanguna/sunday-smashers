-- ---------------------------------------------------------------------------
-- 0009 — close the RLS holes found by the security audit
--
-- Every finding below was proven by executing the attack as the `authenticated`
-- role against a disposable Postgres with these migrations applied. They all
-- survived 1091 unit tests and a full e2e suite because those run in demo mode
-- or as a superuser, and a superuser bypasses RLS entirely. RLS can only be
-- tested as a non-superuser role.
--
-- Three of these are not security bugs at all — they are availability bugs
-- that would have stopped the tournament dead:
--
--   * a duty umpire could not start their match (the UPDATE matched 0 rows and
--     returned no error, so the console reported success and did nothing);
--   * the second score save of every match failed on a duplicate key;
--   * accepting a partner invite created no team and no pair.
--
-- A recurring theme: PostgREST reports a row filtered out by RLS as "0 rows
-- affected", NOT as an error. Any write whose policy does not match is a
-- silent no-op. Callers that only check `error` will report success. The
-- application-side half of that lesson is handled in the calling code.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- C1 — a player could approve their own entry, into a closed division,
--      and name the organiser as the approver.
-- `registrations_insert_own` constrained only `player_id`. Nothing stopped
-- the row being POSTed with status='approved' and a forged `reviewed_by`.
-- ===========================================================================
drop policy if exists "registrations_insert_own" on public.registrations;
create policy "registrations_insert_own" on public.registrations
  for insert with check (
    public.is_admin()
    or (
      auth.uid() = player_id
      and status = 'pending'
      and reviewed_by is null
      and reviewed_at is null
    )
  );


-- ===========================================================================
-- H1 — a player could self-issue an *accepted* invite to a made-up email
--      address. `teams_write_member_or_admin` accepts any accepted invite,
--      and never consumes it, so one forged row minted unlimited teams.
-- Only the invitee may accept, and invites are born pending.
-- ===========================================================================
drop policy if exists "partner_invites_insert_own" on public.partner_invites;
create policy "partner_invites_insert_own" on public.partner_invites
  for insert with check (
    public.is_admin()
    or (
      auth.uid() = inviter_id
      and status = 'pending'
      and resulting_team_id is null
    )
  );

drop policy if exists "partner_invites_update_party_or_admin" on public.partner_invites;
create policy "partner_invites_update_party_or_admin" on public.partner_invites
  for update using (
    auth.uid() = inviter_id or auth.uid() = invitee_id or public.is_admin()
  ) with check (
    -- The inviter may withdraw (back to pending/declined); only the *invitee*
    -- may move an invite to accepted. Previously either party could.
    public.is_admin()
    or auth.uid() = invitee_id
    or (auth.uid() = inviter_id and status <> 'accepted')
  );


-- ===========================================================================
-- C4 — accepting an invite created neither a team nor a pair.
--
-- The old client code inserted the team while the invite was still pending
-- (denied by `teams_write_member_or_admin`, which requires an already-accepted
-- invite), then inserted BOTH players into `team_members` in one statement
-- (denied by `team_members_write_own_or_admin`, which allows only
-- `player_id = auth.uid()`). Neither error was checked, so the UI said
-- "team created" and nothing existed.
--
-- This cannot be expressed as a policy: it is three writes that must happen
-- together, one of which legitimately inserts a row for another user. It
-- belongs in a SECURITY DEFINER function that verifies the caller first.
-- ===========================================================================
create or replace function public.accept_partner_invite(
  p_invite_id uuid,
  p_team_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.partner_invites;
  v_team_id uuid;
  v_division public.divisions;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to accept an invite.'
      using errcode = '42501';
  end if;

  -- Lock the invite so two taps on a flaky phone connection cannot both
  -- create a team.
  select * into v_invite
  from public.partner_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'Invite not found.' using errcode = 'P0002';
  end if;

  if v_invite.invitee_id is distinct from auth.uid() then
    raise exception 'Only the invited player can accept this invite.'
      using errcode = '42501';
  end if;

  if v_invite.status = 'accepted' and v_invite.resulting_team_id is not null then
    -- Idempotent: accepting twice returns the existing team rather than
    -- erroring, so a double-submit is harmless.
    return v_invite.resulting_team_id;
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'This invite is no longer open.' using errcode = 'P0002';
  end if;

  if v_invite.inviter_id = v_invite.invitee_id then
    raise exception 'You cannot pair with yourself.' using errcode = '23514';
  end if;

  select * into v_division from public.divisions where id = v_invite.division_id;
  if not found then
    raise exception 'Division not found.' using errcode = 'P0002';
  end if;

  -- Neither player may already be in a team in this division.
  if exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where t.division_id = v_invite.division_id
      and tm.player_id in (v_invite.inviter_id, v_invite.invitee_id)
  ) then
    raise exception 'One of you is already paired in this division.'
      using errcode = '23505';
  end if;

  insert into public.teams (division_id, name, is_confirmed)
  values (
    v_invite.division_id,
    coalesce(nullif(btrim(p_team_name), ''), 'Pair TBC'),
    false
  )
  returning id into v_team_id;

  insert into public.team_members (team_id, player_id)
  values (v_team_id, v_invite.inviter_id), (v_team_id, v_invite.invitee_id);

  update public.partner_invites
  set status = 'accepted',
      resulting_team_id = v_team_id,
      responded_at = now()
  where id = p_invite_id;

  return v_team_id;
end;
$$;

revoke all on function public.accept_partner_invite(uuid, text) from public, anon;
grant execute on function public.accept_partner_invite(uuid, text) to authenticated;

-- With the RPC owning team creation, players no longer need a direct INSERT
-- path into `teams` — which is what H1 abused.
drop policy if exists "teams_write_member_or_admin" on public.teams;
create policy "teams_write_admin" on public.teams
  for insert with check (public.is_admin());


-- ===========================================================================
-- H2 — any team member could set their own `seed` and `is_confirmed`.
--      Seeding decides the entire draw.
-- Column-level GRANTs cannot express this: admins are also `authenticated`,
-- so revoking the column from the role would break the admin console too.
-- A guard trigger can ask `is_admin()` at runtime. Same pattern as
-- `guard_profile_email` in 0007.
-- ===========================================================================
create or replace function public.guard_team_admin_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.division_id is distinct from old.division_id
     or new.seed is distinct from old.seed
     or new.is_confirmed is distinct from old.is_confirmed then
    raise exception 'Only an organiser can change a team''s division, seed or confirmation.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_team_admin_columns on public.teams;
create trigger guard_team_admin_columns
  before update on public.teams
  for each row execute function public.guard_team_admin_columns();


-- ===========================================================================
-- C2 — the duty umpire could not start their match.
--
-- The USING clause required the row to ALREADY be 'in_progress' before a duty
-- official could touch it, but starting the match is precisely the transition
-- into 'in_progress'. The umpire could therefore never start it, and so could
-- never score it either. RLS filtered the row out, so the UPDATE reported
-- "0 rows" with no error and the console said "Match started."
--
-- 'retired' (added in 0006) was also missing from the WITH CHECK list, so a
-- retirement could not be recorded either.
-- 'retired' (added in 0006) and 'walkover' were both missing from the WITH
-- CHECK list, so two of the three "end match" buttons — the exact scenarios
-- the tournament rules call out, a no-show and a mid-game injury — were
-- rejected by the database for the person standing at the court.
-- ===========================================================================
drop policy if exists "matches_update_admin_or_duty" on public.matches;
create policy "matches_update_admin_or_duty" on public.matches
  for update using (
    public.is_admin()
    or (
      public.is_match_duty_official(id)
      and status in ('scheduled', 'in_progress')
    )
  ) with check (
    public.is_admin()
    or (
      public.is_match_duty_official(id)
      and status in ('in_progress', 'completed', 'forfeited', 'walkover', 'retired')
    )
  );


-- ===========================================================================
-- H5 — the duty umpire could rewrite the match they were officiating:
--      swap the teams, clear the court, set points_to_win to 1, pick the
--      winner. Under the tournament's own rules the umpire is a player in the
--      next match, i.e. someone with a direct stake in the result.
-- RLS is row-level and cannot restrict which columns change, so again a guard
-- trigger. Admins are unaffected.
-- ===========================================================================
create or replace function public.guard_match_official_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.division_id  is distinct from old.division_id
     or new.stage     is distinct from old.stage
     or new.round     is distinct from old.round
     or new.bracket_key   is distinct from old.bracket_key
     or new.court_id      is distinct from old.court_id
     or new.time_slot_id  is distinct from old.time_slot_id
     or new.team_a_id     is distinct from old.team_a_id
     or new.team_b_id     is distinct from old.team_b_id
     or new.points_to_win is distinct from old.points_to_win
     or new.deuce_enabled is distinct from old.deuce_enabled
     or new.cap           is distinct from old.cap
     or new.next_match_id is distinct from old.next_match_id then
    raise exception 'A duty official may only record the score and outcome, not change the fixture.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_match_official_columns on public.matches;
create trigger guard_match_official_columns
  before update on public.matches
  for each row execute function public.guard_match_official_columns();


-- ===========================================================================
-- C3 — the second score save of every match failed.
--
-- `saveScore()` replaces the rally list: DELETE all score_events for the
-- match, then re-INSERT. There was no DELETE policy for duty officials (only
-- `score_events_admin_delete`), so the delete removed 0 rows silently and the
-- re-insert collided with `score_events_match_id_sequence_key`. The console
-- debounce-saves after every tap, so this fired on rally 2 of every match.
-- ===========================================================================
create policy "score_events_delete_duty_while_open" on public.score_events
  for delete using (
    public.is_admin()
    or (
      public.is_match_duty_official(match_id)
      and exists (
        select 1 from public.matches m
        where m.id = score_events.match_id and m.status = 'in_progress'
      )
    )
  );


-- One home for "this sheet is still open for editing". Restating this list at
-- each call site is the single most repeated defect in this project, and the
-- first draft of the policy below got it wrong: it said `status = 'draft'`,
-- but a signature can only ever *exist* on a sheet that has moved on to
-- `awaiting_signature`, so the policy matched nothing and withdraw stayed
-- broken. Anything not yet `submitted`/`verified` is still open.
create or replace function public.scoresheet_is_open(p_status public.scoresheet_status)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select p_status in ('draft', 'awaiting_signature', 'disputed');
$$;

comment on function public.scoresheet_is_open is
  'True while a scoresheet may still be edited/signed. The single source of truth for that list.';

-- ===========================================================================
-- H6 — a duty official could file their own scoresheet already marked
--      'verified' with the organiser named as verifier, bypassing the
--      tabulator entirely. `scoresheets` is unique(match_id), so first wins.
-- ===========================================================================
drop policy if exists "scoresheets_insert_duty_or_admin" on public.scoresheets;
create policy "scoresheets_insert_duty_or_admin" on public.scoresheets
  for insert with check (
    public.is_admin()
    or (
      public.is_match_duty_official(match_id)
      and status = 'draft'
      and verified_by is null
      and verified_at is null
    )
  );


-- ===========================================================================
-- H6b — a DISPUTED sheet was a dead end. The tabulator disputes a sheet
--       precisely so the court can correct and re-submit it, but the UPDATE
--       policy's USING listed only draft/awaiting_signature, so the duty
--       official who has to fix it could not touch the row. Only an admin
--       could, which is not who is standing at the court.
-- Uses scoresheet_is_open() so this list has exactly one home.
-- ===========================================================================
drop policy if exists "scoresheets_update_duty_while_open_or_tabulator" on public.scoresheets;
create policy "scoresheets_update_duty_while_open_or_tabulator" on public.scoresheets
  for update
  using (
    public.is_admin()
    or public.is_tabulator()
    or (
      public.is_match_duty_official(match_id)
      and public.scoresheet_is_open(status)
    )
  )
  with check (
    public.is_admin()
    or public.is_tabulator()
    or (
      public.is_match_duty_official(match_id)
      -- may move it forward to 'submitted', but never to 'verified'
      and (public.scoresheet_is_open(status) or status = 'submitted')
      and verified_by is null
      and verified_at is null
    )
  );


-- ===========================================================================
-- M1 — any signed-in user could sign any scoresheet. The loader maps
--      signature #0 to side A and #1 to side B, so two strangers signing
--      made a sheet look fully signed and submittable.
-- A signature is only valid from someone actually playing in that match.
-- ===========================================================================
drop policy if exists "scoresheet_signatures_insert_own" on public.scoresheet_signatures;
create policy "scoresheet_signatures_insert_own" on public.scoresheet_signatures
  for insert with check (
    public.is_admin()
    or (
      player_id = auth.uid()
      and exists (
        select 1
        from public.scoresheets s
        join public.matches m on m.id = s.match_id
        join public.team_members tm
          on tm.team_id in (m.team_a_id, m.team_b_id)
        where s.id = scoresheet_signatures.scoresheet_id
          and tm.player_id = auth.uid()
      )
    )
  );


-- ===========================================================================
-- M2 — "withdraw signature" / "reopen sheet" silently did nothing. Only
--      admins had a DELETE policy, so the delete removed 0 rows, reported
--      success, and the signature reappeared on reload.
-- ===========================================================================

create policy "scoresheet_signatures_delete_while_open" on public.scoresheet_signatures
  for delete using (
    public.is_admin()
    or (
      exists (
        select 1 from public.scoresheets s
        where s.id = scoresheet_signatures.scoresheet_id
          and public.scoresheet_is_open(s.status)
      )
      and (
        player_id = auth.uid()
        or exists (
          select 1 from public.scoresheets s
          where s.id = scoresheet_signatures.scoresheet_id
            and public.is_match_duty_official(s.match_id)
        )
      )
    )
  );


-- ===========================================================================
-- M3 — the audit log was empty for every non-admin action.
-- INSERT required is_admin(), but the actions worth auditing (a tabulator
-- verifying or disputing a scoresheet, a duty official recording a result)
-- are by definition not performed by admins. Reading stays admin-only, and
-- there is deliberately still no UPDATE or DELETE policy: an audit log that
-- can be edited is not an audit log.
-- ===========================================================================
drop policy if exists "audit_log_admin_only" on public.audit_log;
create policy "audit_log_select_admin" on public.audit_log
  for select using (public.is_admin());
create policy "audit_log_insert_self" on public.audit_log
  for insert with check (
    auth.uid() is not null and actor_id = auth.uid()
  );


-- ===========================================================================
-- M4 — `standings` is a view, and a view defaults to security_invoker=false,
--      i.e. it runs as its owner (postgres) and bypasses RLS on the tables
--      underneath. Anon could read teams and results for divisions that were
--      never published, through the view.
-- ===========================================================================
alter view public.standings set (security_invoker = on);


-- ===========================================================================
-- L1 — `has_role(uuid, user_role)` was executable by anon, letting anyone
--      who knows a user's UUID test whether that person is an organiser.
--      `is_admin()`/`is_tabulator()` take no argument and only ever answer
--      about the caller, so they stay as they are.
-- ===========================================================================
revoke execute on function public.has_role(uuid, public.user_role) from public, anon;


-- ===========================================================================
-- H4 — public visitors saw no player names at all.
--
-- `profiles` holds phone numbers and emergency contacts, so it correctly has
-- no anon SELECT policy. But the public pages read names straight from it,
-- got 0 rows, and fell back to the literal string 'Player' — on the schedule,
-- standings, players directory, duty roster and the courtside TV scoreboard.
--
-- The `player_directory` view from 0002 is already the right shape (a column
-- whitelist, security_invoker=off, granted to anon) and was the intended home
-- for this. It just carried `where auth.uid() is not null`, so it returned
-- nothing to the very audience it exists for. That predicate protects nothing:
-- the view names only non-sensitive columns, and requiring a login to see a
-- player's name would make the public schedule, bracket and TV scoreboard
-- unusable — the TV in the gym is never signed in.
--
-- Fixed in place rather than by adding a second near-identical view. Two homes
-- for one list is the defect that keeps recurring in this project.
-- ===========================================================================
create or replace view public.player_directory
with (security_invoker = off) as
  select
    p.id,
    p.full_name,
    p.nickname,
    p.avatar_url
  from public.profiles p;

comment on view public.player_directory is
  'Name and avatar only, for public pages (schedule, standings, players, TV). Deliberately security_invoker=off so anon can read it, which is safe because the view names only non-sensitive columns — never add phone/emergency contact here.';

revoke all on public.player_directory from public, anon, authenticated;
grant select on public.player_directory to anon, authenticated;


-- ===========================================================================
-- H3 — any signed-in user could publish an unmoderated photo straight to the
--      public gallery. The insert policy constrained only `uploaded_by`, so
--      the row could be POSTed with moderation_status='approved' and
--      is_featured=true; the `sync_photo_moderation` trigger then set
--      is_approved, and the select policy showed it to anon. For a club with
--      junior members that is the one piece of user content that must not
--      bypass review.
-- ===========================================================================
drop policy if exists "photos_insert_own_or_admin" on public.photos;
create policy "photos_insert_own_or_admin" on public.photos
  for insert with check (
    public.is_admin()
    or (
      uploaded_by = auth.uid()
      and moderation_status = 'pending'
      and not is_featured
      and approved_by is null
    )
  );


-- ===========================================================================
-- Data integrity — things the database happily accepted.
-- TypeScript validation is bypassable (the anon key talks to PostgREST
-- directly) and non-atomic. These belong in the database.
-- ===========================================================================

-- Two matches could be scheduled on the same court in the same time slot.
create unique index if not exists uq_matches_court_slot
  on public.matches (court_id, time_slot_id)
  where court_id is not null
    and time_slot_id is not null
    and status <> 'cancelled';

-- A score could exceed the match's own target (47-3 was accepted).
-- Only enforced once the match is decided; an in-progress row is transient.
alter table public.matches drop constraint if exists score_within_cap;
alter table public.matches add constraint score_within_cap check (
  status in ('scheduled', 'in_progress', 'cancelled')
  or (
    score_a <= coalesce(cap, points_to_win)
    and score_b <= coalesce(cap, points_to_win)
  )
);

-- The winner could be the team with fewer points. Retirements, forfeits and
-- walkovers are exempt: those are won without out-scoring the opponent.
alter table public.matches drop constraint if exists winner_matches_score;
alter table public.matches add constraint winner_matches_score check (
  status <> 'completed'
  or winner_team_id is null
  or (winner_team_id = team_a_id and score_a > score_b)
  or (winner_team_id = team_b_id and score_b > score_a)
);
