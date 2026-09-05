-- =============================================================================
-- Sunday Smashers — demo/seed data
-- =============================================================================
--
-- Local development + demo data for `supabase db reset` / `npx supabase start`.
-- Deliberately NOT idempotent against re-running twice with the same auth
-- users (it creates its own fixed-UUID auth.users rows), but IS safe to run
-- against a freshly reset local database, which is the supported workflow:
--
--   npx supabase db reset
--
-- Shape: one tournament (13 Dec 2026), two divisions (Men's / Women's
-- Doubles), 11 pairs (22 players) per division — a full single round robin
-- of 11 pairs yields 10 games per pair (55 total fixtures), matching the
-- "10 games each pair" quoted in the draft rules. A handful of elims
-- matches are marked completed so the standings view has something to show.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- auth.users — minimal fixed-uuid demo accounts (players + 1 admin + 1 tabulator)
-- ---------------------------------------------------------------------------
-- Supabase's auth.users has many NOT NULL-ish columns handled by defaults in
-- a real project; for local seeding we insert the minimal set Supabase's
-- local stack expects. Passwords are irrelevant for seed data (no one logs
-- in as these accounts via password in demos), so a fixed dummy hash is used.

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
select
  u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, crypt('sunday-smashers-demo', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name),
  now(), now()
from (values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'admin@sundaysmashers.test', 'Alex Admin'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'tabulator@sundaysmashers.test', 'Tara Tabulator'),
  -- Men's Doubles — 11 pairs / 22 players
  ('10000000-0000-0000-0000-000000000001'::uuid, 'm01a@sundaysmashers.test', 'Marcus Tan'),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'm01b@sundaysmashers.test', 'Wei Chen'),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'm02a@sundaysmashers.test', 'Ryan Lee'),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'm02b@sundaysmashers.test', 'Josh Ng'),
  ('10000000-0000-0000-0000-000000000005'::uuid, 'm03a@sundaysmashers.test', 'Kevin Ho'),
  ('10000000-0000-0000-0000-000000000006'::uuid, 'm03b@sundaysmashers.test', 'Daniel Goh'),
  ('10000000-0000-0000-0000-000000000007'::uuid, 'm04a@sundaysmashers.test', 'Aaron Koh'),
  ('10000000-0000-0000-0000-000000000008'::uuid, 'm04b@sundaysmashers.test', 'Ben Teo'),
  ('10000000-0000-0000-0000-000000000009'::uuid, 'm05a@sundaysmashers.test', 'Chris Lim'),
  ('10000000-0000-0000-0000-000000000010'::uuid, 'm05b@sundaysmashers.test', 'Derek Ong'),
  ('10000000-0000-0000-0000-000000000011'::uuid, 'm06a@sundaysmashers.test', 'Eugene Tay'),
  ('10000000-0000-0000-0000-000000000012'::uuid, 'm06b@sundaysmashers.test', 'Felix Yeo'),
  ('10000000-0000-0000-0000-000000000013'::uuid, 'm07a@sundaysmashers.test', 'Gabriel Sim'),
  ('10000000-0000-0000-0000-000000000014'::uuid, 'm07b@sundaysmashers.test', 'Harry Toh'),
  ('10000000-0000-0000-0000-000000000015'::uuid, 'm08a@sundaysmashers.test', 'Ian Foo'),
  ('10000000-0000-0000-0000-000000000016'::uuid, 'm08b@sundaysmashers.test', 'Jack Neo'),
  ('10000000-0000-0000-0000-000000000017'::uuid, 'm09a@sundaysmashers.test', 'Kyle Ang'),
  ('10000000-0000-0000-0000-000000000018'::uuid, 'm09b@sundaysmashers.test', 'Leon Chua'),
  ('10000000-0000-0000-0000-000000000019'::uuid, 'm10a@sundaysmashers.test', 'Mark Wee'),
  ('10000000-0000-0000-0000-000000000020'::uuid, 'm10b@sundaysmashers.test', 'Nathan Poh'),
  ('10000000-0000-0000-0000-000000000021'::uuid, 'm11a@sundaysmashers.test', 'Oscar Low'),
  ('10000000-0000-0000-0000-000000000022'::uuid, 'm11b@sundaysmashers.test', 'Peter Quek'),
  -- Women's Doubles — 11 pairs / 22 players
  ('20000000-0000-0000-0000-000000000001'::uuid, 'w01a@sundaysmashers.test', 'Amanda Lim'),
  ('20000000-0000-0000-0000-000000000002'::uuid, 'w01b@sundaysmashers.test', 'Bella Chua'),
  ('20000000-0000-0000-0000-000000000003'::uuid, 'w02a@sundaysmashers.test', 'Carmen Goh'),
  ('20000000-0000-0000-0000-000000000004'::uuid, 'w02b@sundaysmashers.test', 'Diana Koh'),
  ('20000000-0000-0000-0000-000000000005'::uuid, 'w03a@sundaysmashers.test', 'Ella Tan'),
  ('20000000-0000-0000-0000-000000000006'::uuid, 'w03b@sundaysmashers.test', 'Faith Ong'),
  ('20000000-0000-0000-0000-000000000007'::uuid, 'w04a@sundaysmashers.test', 'Grace Teo'),
  ('20000000-0000-0000-0000-000000000008'::uuid, 'w04b@sundaysmashers.test', 'Hannah Yeo'),
  ('20000000-0000-0000-0000-000000000009'::uuid, 'w05a@sundaysmashers.test', 'Iris Sim'),
  ('20000000-0000-0000-0000-000000000010'::uuid, 'w05b@sundaysmashers.test', 'Jasmine Toh'),
  ('20000000-0000-0000-0000-000000000011'::uuid, 'w06a@sundaysmashers.test', 'Kylie Foo'),
  ('20000000-0000-0000-0000-000000000012'::uuid, 'w06b@sundaysmashers.test', 'Lena Neo'),
  ('20000000-0000-0000-0000-000000000013'::uuid, 'w07a@sundaysmashers.test', 'Mia Ang'),
  ('20000000-0000-0000-0000-000000000014'::uuid, 'w07b@sundaysmashers.test', 'Nadia Chen'),
  ('20000000-0000-0000-0000-000000000015'::uuid, 'w08a@sundaysmashers.test', 'Olivia Wee'),
  ('20000000-0000-0000-0000-000000000016'::uuid, 'w08b@sundaysmashers.test', 'Priya Poh'),
  ('20000000-0000-0000-0000-000000000017'::uuid, 'w09a@sundaysmashers.test', 'Queenie Low'),
  ('20000000-0000-0000-0000-000000000018'::uuid, 'w09b@sundaysmashers.test', 'Rachel Quek'),
  ('20000000-0000-0000-0000-000000000019'::uuid, 'w10a@sundaysmashers.test', 'Sarah Ho'),
  ('20000000-0000-0000-0000-000000000020'::uuid, 'w10b@sundaysmashers.test', 'Tina Ng'),
  ('20000000-0000-0000-0000-000000000021'::uuid, 'w11a@sundaysmashers.test', 'Uma Lee'),
  ('20000000-0000-0000-0000-000000000022'::uuid, 'w11b@sundaysmashers.test', 'Vera Tay')
) as u(id, email, full_name)
on conflict (id) do nothing;

-- Profiles + a 'player' role are normally created by the `handle_new_user`
-- trigger, but the trigger only fires on a real `auth.users` INSERT via the
-- GoTrue API — a direct SQL insert (as above) still fires the AFTER INSERT
-- trigger, so profiles already exist. Backfill nicknames/skill for flavour.

update public.profiles set skill_level = 'intermediate' where skill_level is null;

-- Grant the extra roles.
insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-000000000001', 'admin'),
  ('00000000-0000-0000-0000-000000000002', 'tabulator')
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- Tournament + divisions
-- ---------------------------------------------------------------------------

insert into public.tournaments (
  id, name, slug, tournament_date, registration_opens_at, registration_closes_at,
  venue_name, venue_address, status, is_published, is_registration_open, description
) values (
  '30000000-0000-0000-0000-000000000001',
  'Sunday Smashers Christmas Mini Tournament',
  'christmas-mini-2026',
  '2026-12-13',
  '2026-09-06 00:00:00+08',
  '2026-12-06 23:59:59+08',
  'Community Sports Hall',
  '1 Badminton Way, Singapore',
  'published',
  true,
  true,
  'A festive one-day doubles mini tournament: round robin eliminations, then semis and finals on the day.'
) on conflict (id) do nothing;

insert into public.divisions (
  id, tournament_id, name, gender, format_kind,
  points_to_win_elims, deuce_enabled_elims,
  points_to_win_finals, deuce_enabled_finals,
  qualifying_places, is_published
) values
  ('30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000001',
   'Men''s Doubles', 'mens', 'round_robin_knockout', 15, false, 21, false, 4, true),
  ('30000000-0000-0000-0000-000000000012', '30000000-0000-0000-0000-000000000001',
   'Women''s Doubles', 'womens', 'round_robin_knockout', 15, false, 21, false, 4, true)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- Courts + time slots
-- ---------------------------------------------------------------------------

insert into public.courts (id, tournament_id, name, sort_order) values
  ('30000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000001', 'Court 1', 1),
  ('30000000-0000-0000-0000-000000000022', '30000000-0000-0000-0000-000000000001', 'Court 2', 2),
  ('30000000-0000-0000-0000-000000000023', '30000000-0000-0000-0000-000000000001', 'Court 3', 3),
  ('30000000-0000-0000-0000-000000000024', '30000000-0000-0000-0000-000000000001', 'Court 4', 4)
on conflict (id) do nothing;

insert into public.time_slots (id, tournament_id, starts_at, ends_at, label)
select
  ('30000000-0000-0000-0001-' || lpad(n::text, 12, '0'))::uuid,
  '30000000-0000-0000-0000-000000000001',
  ('2026-12-13 08:00:00+08'::timestamptz) + ((n - 1) * interval '20 minutes'),
  ('2026-12-13 08:00:00+08'::timestamptz) + (n * interval '20 minutes'),
  'Slot ' || n
from generate_series(1, 20) as n
on conflict (tournament_id, starts_at) do nothing;


-- ---------------------------------------------------------------------------
-- Teams + team_members (11 pairs per division)
-- ---------------------------------------------------------------------------

do $$
declare
  division_men constant uuid := '30000000-0000-0000-0000-000000000011';
  division_women constant uuid := '30000000-0000-0000-0000-000000000012';
  i integer;
  team_id uuid;
  player_a uuid;
  player_b uuid;
begin
  for i in 1..11 loop
    -- Men's team i
    team_id := ('30000000-0000-0001-0000-' || lpad(i::text, 12, '0'))::uuid;
    player_a := ('10000000-0000-0000-0000-' || lpad((i * 2 - 1)::text, 12, '0'))::uuid;
    player_b := ('10000000-0000-0000-0000-' || lpad((i * 2)::text, 12, '0'))::uuid;

    insert into public.teams (id, division_id, seed, is_confirmed)
    values (team_id, division_men, i, true)
    on conflict (id) do nothing;

    insert into public.team_members (team_id, player_id) values (team_id, player_a), (team_id, player_b)
    on conflict do nothing;

    -- Women's team i
    team_id := ('30000000-0000-0002-0000-' || lpad(i::text, 12, '0'))::uuid;
    player_a := ('20000000-0000-0000-0000-' || lpad((i * 2 - 1)::text, 12, '0'))::uuid;
    player_b := ('20000000-0000-0000-0000-' || lpad((i * 2)::text, 12, '0'))::uuid;

    insert into public.teams (id, division_id, seed, is_confirmed)
    values (team_id, division_women, i, true)
    on conflict (id) do nothing;

    insert into public.team_members (team_id, player_id) values (team_id, player_a), (team_id, player_b)
    on conflict do nothing;
  end loop;
end $$;

-- Registrations (approved) + payments (paid) for every seeded player.
insert into public.registrations (tournament_id, division_id, player_id, status, reviewed_at)
select '30000000-0000-0000-0000-000000000001', t.division_id, tm.player_id, 'approved', now()
from public.team_members tm
join public.teams t on t.id = tm.team_id
where t.division_id in ('30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000012')
on conflict (division_id, player_id) do nothing;

insert into public.payments (registration_id, amount_cents, amount_paid_cents, status)
select r.id, 2000, 2000, 'paid'
from public.registrations r
where r.tournament_id = '30000000-0000-0000-0000-000000000001'
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- A handful of played elims matches per division (illustrative, not a full
-- round robin draw — the draw/scheduler is generated in TypeScript via
-- `src/lib/draw.ts#generateRoundRobin`, not hand-seeded here).
-- ---------------------------------------------------------------------------

do $$
declare
  division_men constant uuid := '30000000-0000-0000-0000-000000000011';
  division_women constant uuid := '30000000-0000-0000-0000-000000000012';
  team_m1 constant uuid := '30000000-0000-0001-0000-000000000001';
  team_m2 constant uuid := '30000000-0000-0001-0000-000000000002';
  team_m3 constant uuid := '30000000-0000-0001-0000-000000000003';
  team_m4 constant uuid := '30000000-0000-0001-0000-000000000004';
  team_w1 constant uuid := '30000000-0000-0002-0000-000000000001';
  team_w2 constant uuid := '30000000-0000-0002-0000-000000000002';
  team_w3 constant uuid := '30000000-0000-0002-0000-000000000003';
  team_w4 constant uuid := '30000000-0000-0002-0000-000000000004';
  court1 constant uuid := '30000000-0000-0000-0000-000000000021';
  court2 constant uuid := '30000000-0000-0000-0000-000000000022';
begin
  insert into public.matches (
    division_id, stage, round, court_id, team_a_id, team_b_id,
    points_to_win, status, score_a, score_b, winner_team_id, started_at, completed_at
  ) values
    (division_men, 'elims', 1, court1, team_m1, team_m2, 15, 'completed', 15, 9, team_m1, now() - interval '3 hours', now() - interval '2 hours 40 minutes'),
    (division_men, 'elims', 1, court2, team_m3, team_m4, 15, 'completed', 15, 12, team_m3, now() - interval '3 hours', now() - interval '2 hours 40 minutes'),
    (division_men, 'elims', 2, court1, team_m1, team_m3, 15, 'completed', 15, 13, team_m1, now() - interval '2 hours 30 minutes', now() - interval '2 hours 10 minutes'),
    (division_men, 'elims', 2, court2, team_m2, team_m4, 15, 'in_progress', 8, 6, null, now() - interval '10 minutes', null),
    (division_women, 'elims', 1, court1, team_w1, team_w2, 15, 'completed', 15, 7, team_w1, now() - interval '3 hours', now() - interval '2 hours 40 minutes'),
    (division_women, 'elims', 1, court2, team_w3, team_w4, 15, 'completed', 13, 15, team_w4, now() - interval '3 hours', now() - interval '2 hours 40 minutes'),
    (division_women, 'elims', 2, court1, team_w1, team_w4, 15, 'scheduled', 0, 0, null, null, null);
end $$;


-- ---------------------------------------------------------------------------
-- Announcements + site content (draft rules text)
-- ---------------------------------------------------------------------------

insert into public.announcements (tournament_id, title, body, is_published, is_pinned, created_by) values
  ('30000000-0000-0000-0000-000000000001',
   'Welcome to the Christmas Mini Tournament!',
   'Registration is now open. See you on court 13 December — bring your festive spirit (and a spare shuttle)!',
   true, true, '00000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001',
   'Scoresheet reminder',
   'Remember: the scoresheet person submits the signed sheet to the Tabulator at the end of every game, not just the match.',
   true, false, '00000000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.site_content (slug, title, body_markdown, is_published, updated_by) values
(
  'draft-rules-v1',
  'Tournament Rules (Draft v1)',
  $md$
# Sunday Smashers Christmas Mini Tournament — Draft Rules (v1)

These rules are a draft and may be adjusted by the organising committee
before the tournament.

## Format

- **Eliminations**: single round robin. First to **15 points, no deuce**.
  Ranking is by number of **wins**; ties are broken by **head-to-head**
  result (or a mini league / point difference / points scored for 3+ way
  ties).
- **Semi-finals**: top 4 pairs qualify. M1 = Rank 1 vs Rank 4, M2 = Rank 2
  vs Rank 3. First to **21 points, no deuce**.
- **Finals**: the losers of M1/M2 play the **Battle for 3rd**; the winners
  play the **Championship**.

## On-court duties

Scoresheets are provided **per court** and must be **signed by both pairs
after every game**. The players in the **next match-up on that court** are
rostered as:

- **Umpire / Scorer**
- **Scoresheet person**
- **2x Line persons**

The umpire's and line judges' calls are **final**. The scoresheet person
**submits the signed scoresheet to the Tabulator at the end of each
game**.

## Forfeits

A pair has **2 minutes** from their match being called to be on court and
ready. **Late arrival or a no-show forfeits that game automatically** once
those 2 minutes are up.

$md$,
  true,
  '00000000-0000-0000-0000-000000000001'
)
on conflict (slug) do update set
  title = excluded.title,
  body_markdown = excluded.body_markdown,
  is_published = excluded.is_published;

commit;
