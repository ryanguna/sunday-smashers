-- ===========================================================================
-- Role coverage: duty_official and tabulator.
--
-- The existing suites lean heavily on `admin` and `player` — between them 34
-- and 17 mentions, against 1 for tabulator and 0 for duty_official. Those two
-- are the tournament-day roles: get them wrong in one direction and the
-- officials standing at the court cannot record a score, get them wrong in the
-- other and any signed-in player can rewrite results.
--
-- Actors come from 01_fixture.sql:
--   a0 admin · a1 alice (plays for Team One) · a2 bob (plays for Team Two)
--   a3 carol (umpire_scorer rostered on match a9) · a4 dave (unrelated)
-- ===========================================================================

-- Dave becomes the tabulator. He is deliberately NOT an admin, so every
-- "tabulator can do X" check below also proves X does not silently require
-- admin, and every "tabulator cannot do Y" proves the role is not a backdoor.
insert into public.user_roles (user_id, role)
values ('00000000-0000-0000-0000-0000000000a4', 'tabulator')
on conflict do nothing;

-- A match of this suite's own, freshly scheduled, with carol rostered on it.
--
-- The earlier files run against this same database and leave fixture match a9
-- 'retired' with a 'disputed' scoresheet, so reusing it would test a finished
-- match — where every one of these denials is correct behaviour rather than a
-- policy under test. This one starts clean.
-- Its own time slot: `uq_matches_court_slot` allows only one match per court
-- per slot, which is the schedule clash guard doing its job.
insert into public.time_slots (id, tournament_id, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000f1',
        '2026-12-13 10:00+00','2026-12-13 10:30+00')
on conflict (id) do nothing;

insert into public.matches (id, division_id, stage, round, court_id, time_slot_id,
                            team_a_id, team_b_id, points_to_win, status)
values ('00000000-0000-0000-0000-00000000009b','00000000-0000-0000-0000-0000000000d1','elims',2,
        '00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b2',
        '00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2',15,'scheduled')
on conflict (id) do nothing;

insert into public.duty_assignments (match_id, player_id, duty_role)
values ('00000000-0000-0000-0000-00000000009b','00000000-0000-0000-0000-0000000000a3','umpire_scorer')
on conflict do nothing;

insert into public.scoresheets (id, match_id, status, score_a, score_b)
values ('00000000-0000-0000-0000-00000000005a', '00000000-0000-0000-0000-00000000009b', 'draft', 0, 0)
on conflict (match_id) do nothing;

\echo '--- Duty official: only the rostered official drives the match ---'

select public._t(
  'the rostered umpire can start the match she is officiating',
  '00000000-0000-0000-0000-0000000000a3',
  $$update public.matches set status = 'in_progress'
    where id = '00000000-0000-0000-0000-00000000009b'$$,
  'allow');

select public._t(
  'an unrelated player cannot touch the match',
  '00000000-0000-0000-0000-0000000000a4',
  $$update public.matches set status = 'completed'
    where id = '00000000-0000-0000-0000-00000000009b'$$,
  'deny');

-- The sharpest edge in the whole roster design: alice is *playing* in this
-- match. Being on court must not confer any power over the result.
select public._t(
  'a player IN the match cannot score it — only the rostered official may',
  '00000000-0000-0000-0000-0000000000a1',
  $$update public.matches set status = 'completed', winner_team_id = '00000000-0000-0000-0000-0000000000e1'
    where id = '00000000-0000-0000-0000-00000000009b'$$,
  'deny');

\echo '--- Duty official: score only, never the fixture (guard trigger H5) ---'

select public._t(
  'the umpire cannot swap the teams in her own match',
  '00000000-0000-0000-0000-0000000000a3',
  $$update public.matches set team_a_id = '00000000-0000-0000-0000-0000000000e2'
    where id = '00000000-0000-0000-0000-00000000009b'$$,
  'deny');

select public._t(
  'the umpire cannot shorten the match to a single point',
  '00000000-0000-0000-0000-0000000000a3',
  $$update public.matches set points_to_win = 1
    where id = '00000000-0000-0000-0000-00000000009b'$$,
  'deny');

select public._t(
  'the umpire cannot move the match to another court',
  '00000000-0000-0000-0000-0000000000a3',
  $$update public.matches set court_id = null
    where id = '00000000-0000-0000-0000-00000000009b'$$,
  'deny');

\echo '--- Duty official: score_events (the save/undo round trip) ---'

select public._t(
  'the umpire can record a rally',
  '00000000-0000-0000-0000-0000000000a3',
  $$insert into public.score_events (match_id, sequence, side, score_a_after, score_b_after)
    values ('00000000-0000-0000-0000-00000000009b',1,'a',1,0)$$,
  'allow');

-- saveScore() replaces the rally list wholesale: DELETE then re-INSERT. With
-- no delete policy the delete silently removed nothing and every save after
-- the first failed on the sequence unique constraint (regression C3).
select public._t(
  'the umpire can clear her own rallies, so the second save of a match works',
  '00000000-0000-0000-0000-0000000000a3',
  $$delete from public.score_events where match_id = '00000000-0000-0000-0000-00000000009b'$$,
  'allow');

select public._t(
  'a bystander cannot inject rallies into someone else''s match',
  '00000000-0000-0000-0000-0000000000a4',
  $$insert into public.score_events (match_id, sequence, side, score_a_after, score_b_after)
    values ('00000000-0000-0000-0000-00000000009b',9,'a',9,0)$$,
  'deny');

\echo '--- Tabulator: verification is theirs alone ---'

select public._t(
  'the duty official may submit a scoresheet',
  '00000000-0000-0000-0000-0000000000a3',
  $$update public.scoresheets set status = 'submitted'
    where id = '00000000-0000-0000-0000-00000000005a'$$,
  'allow');

-- The whole point of a separate tabulator: the people who played and
-- officiated cannot also be the ones who sign the result off.
select public._t(
  'the duty official may NOT verify it — that is the tabulator''s job',
  '00000000-0000-0000-0000-0000000000a3',
  $$update public.scoresheets set status = 'verified'
    where id = '00000000-0000-0000-0000-00000000005a'$$,
  'deny');

select public._t(
  'a plain player cannot verify a scoresheet',
  '00000000-0000-0000-0000-0000000000a1',
  $$update public.scoresheets set status = 'verified'
    where id = '00000000-0000-0000-0000-00000000005a'$$,
  'deny');

select public._t(
  'the tabulator can verify the scoresheet',
  '00000000-0000-0000-0000-0000000000a4',
  $$update public.scoresheets set status = 'verified',
      verified_by = '00000000-0000-0000-0000-0000000000a4', verified_at = now()
    where id = '00000000-0000-0000-0000-00000000005a'$$,
  'allow');

\echo '--- No role is a backdoor to another (privilege escalation) ---'

select public._t(
  'a player cannot make themselves an admin',
  '00000000-0000-0000-0000-0000000000a1',
  $$insert into public.user_roles (user_id, role)
    values ('00000000-0000-0000-0000-0000000000a1','admin')$$,
  'deny');

select public._t(
  'a player cannot make themselves a tabulator',
  '00000000-0000-0000-0000-0000000000a1',
  $$insert into public.user_roles (user_id, role)
    values ('00000000-0000-0000-0000-0000000000a1','tabulator')$$,
  'deny');

-- is_tabulator() is `is_admin() OR has_role(tabulator)`, so the role reaches
-- some admin-ish surfaces. It must not reach role management itself.
select public._t(
  'a tabulator cannot grant roles — that stays admin-only',
  '00000000-0000-0000-0000-0000000000a4',
  $$insert into public.user_roles (user_id, role)
    values ('00000000-0000-0000-0000-0000000000a4','admin')$$,
  'deny');

select public._t(
  'a duty official cannot grant roles either',
  '00000000-0000-0000-0000-0000000000a3',
  $$insert into public.user_roles (user_id, role)
    values ('00000000-0000-0000-0000-0000000000a3','admin')$$,
  'deny');

select public._t(
  'a player cannot strip an admin of their role',
  '00000000-0000-0000-0000-0000000000a1',
  $$delete from public.user_roles
    where user_id = '00000000-0000-0000-0000-0000000000a0' and role = 'admin'$$,
  'deny');

select public._t(
  'the admin can grant a role, which is what the console does',
  '00000000-0000-0000-0000-0000000000a0',
  $$insert into public.user_roles (user_id, role)
    values ('00000000-0000-0000-0000-0000000000a2','duty_official')$$,
  'allow');

\echo '--- Tabulator is not an admin in disguise ---'

select public._t(
  'a tabulator cannot publish the tournament',
  '00000000-0000-0000-0000-0000000000a4',
  $$update public.tournaments set is_published = true
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'deny');

select public._t(
  'a tabulator cannot approve their own registration',
  '00000000-0000-0000-0000-0000000000a4',
  $$update public.registrations set status = 'approved'
    where division_id = '00000000-0000-0000-0000-0000000000d1'$$,
  'deny');
