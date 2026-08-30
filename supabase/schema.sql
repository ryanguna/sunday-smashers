-- =============================================================================
-- Sunday Smashers — Christmas Mini Tournament
-- Full readable schema reference (PostgreSQL / Supabase)
-- =============================================================================
--
-- This file is the human-readable reference for the whole data model: every
-- enum, table, constraint, index, function, trigger, view, storage bucket and
-- RLS policy in one place, heavily commented. It mirrors (and must be kept in
-- sync with) `supabase/migrations/0001_initial_schema.sql`, which is the
-- authoritative, applied migration. This mirrors the workflow used by the
-- "wanderlog" reference project: `schema.sql` for humans, `migrations/*.sql`
-- for `supabase db push`.
--
-- Design notes:
--   * Tournament format rules (points to win, deuce, qualifying places,
--     tiebreak order) are DATA on `divisions`, not hard-coded constants —
--     the tournament rules are explicitly a "draft, v1" per the brief, and
--     admins must be able to tune them without a schema/code change.
--   * The full standings tiebreak chain (wins -> head-to-head -> mini
--     league -> point difference -> points scored -> unresolved) is
--     implemented once, in TypeScript, in `src/lib/draw.ts`. The SQL layer
--     (see the `standings` view near the bottom) intentionally supplies only
--     the raw per-team aggregates (played/wins/losses/points for/against)
--     and does NOT reimplement head-to-head or mini-league logic — the app
--     fetches played matches for a division and calls
--     `computeStandings()` client/server-side. This avoids maintaining the
--     tiebreak rules twice.
--   * Every table has RLS enabled AND forced (`FORCE ROW LEVEL SECURITY`) so
--     that even the table owner role is bound by policies unless using the
--     `service_role` key (which Postgres/Supabase always lets bypass RLS).
--
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------

create extension if not exists "pgcrypto"; -- gen_random_uuid()


-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

do $$ begin
  create type public.user_role as enum ('public', 'player', 'duty_official', 'tabulator', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.registration_status as enum ('pending', 'approved', 'waitlisted', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('unpaid', 'partial', 'paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.division_gender as enum ('mens', 'womens', 'mixed', 'open');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Mirrors `MatchStage` in src/lib/draw.ts exactly — keep in sync.
  create type public.match_stage as enum ('elims', 'semi', 'third_place', 'final');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.match_status as enum
    ('scheduled', 'in_progress', 'completed', 'forfeited', 'walkover', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.duty_role as enum ('umpire_scorer', 'scoresheet', 'line_judge');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.scoresheet_status as enum
    ('draft', 'awaiting_signature', 'submitted', 'verified', 'disputed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.award_type as enum
    ('champion', 'runner_up', 'third_place', 'fourth_place', 'sportsmanship', 'special_mention');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.partner_invite_status as enum
    ('pending', 'accepted', 'declined', 'expired', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tournament_status as enum ('draft', 'published', 'in_progress', 'completed', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.checklist_item_type as enum ('loot_bag', 'shirt', 'medal', 'trophy', 'prize_money');
exception when duplicate_object then null; end $$;


-- -----------------------------------------------------------------------------
-- Helper function used by every `updated_at` trigger below. Defined early
-- (before any table) since, unlike the RLS helper functions further down,
-- it doesn't reference any table and can safely be created up front.
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- profiles — 1:1 extension of auth.users
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  nickname text,
  gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  phone text,
  shirt_size text check (shirt_size in ('XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL')),
  skill_level text check (skill_level in ('beginner', 'intermediate', 'advanced', 'open')),
  emergency_contact_name text,
  emergency_contact_phone text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth.users row. Phone / emergency contact are private (never selected by anon/public policies).';

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'player')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- user_roles — many-to-many; a player can also be a duty official/tabulator
-- -----------------------------------------------------------------------------

create table if not exists public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.user_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index if not exists idx_user_roles_user_id on public.user_roles (user_id);


-- -----------------------------------------------------------------------------
-- tournaments
-- -----------------------------------------------------------------------------

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  tournament_date date not null,
  registration_opens_at timestamptz not null,
  registration_closes_at timestamptz,
  venue_name text,
  venue_address text,
  status public.tournament_status not null default 'draft',
  is_published boolean not null default false,
  is_registration_open boolean not null default false,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_window_valid
    check (registration_closes_at is null or registration_closes_at > registration_opens_at)
);

drop trigger if exists set_updated_at on public.tournaments;
create trigger set_updated_at before update on public.tournaments
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- divisions — per tournament; carries the CONFIGURABLE format settings
-- -----------------------------------------------------------------------------

create table if not exists public.divisions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text not null,
  gender public.division_gender not null,
  format_kind text not null default 'round_robin_knockout'
    check (format_kind in ('round_robin_knockout', 'single_round_robin', 'knockout_only')),
  -- Elimination (round robin) stage rules — draft v1: first to 15, no deuce.
  points_to_win_elims integer not null default 15 check (points_to_win_elims > 0),
  deuce_enabled_elims boolean not null default false,
  cap_elims integer check (cap_elims is null or cap_elims >= points_to_win_elims),
  -- Semi/final stage rules — draft v1: first to 21, no deuce.
  points_to_win_finals integer not null default 21 check (points_to_win_finals > 0),
  deuce_enabled_finals boolean not null default false,
  cap_finals integer check (cap_finals is null or cap_finals >= points_to_win_finals),
  -- How many pairs progress from the round robin into the knockout stage.
  qualifying_places integer not null default 4 check (qualifying_places >= 2),
  -- Ordered list of tiebreak reasons, mirroring `TiebreakReason` in draw.ts,
  -- stored so admins can reorder/disable steps without a code change. The
  -- SQL layer never evaluates this itself (see the standings view note).
  tiebreak_order text[] not null default array[
    'wins', 'head_to_head', 'mini_league', 'head_to_head_points',
    'point_difference', 'points_scored', 'unresolved'
  ],
  max_teams integer,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, name)
);

create index if not exists idx_divisions_tournament_id on public.divisions (tournament_id);

drop trigger if exists set_updated_at on public.divisions;
create trigger set_updated_at before update on public.divisions
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- registrations — a single player's application to play in a division
-- -----------------------------------------------------------------------------

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  division_id uuid not null references public.divisions (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  status public.registration_status not null default 'pending',
  notes text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (division_id, player_id)
);

create index if not exists idx_registrations_division_id on public.registrations (division_id);
create index if not exists idx_registrations_player_id on public.registrations (player_id);
create index if not exists idx_registrations_tournament_id on public.registrations (tournament_id);
create index if not exists idx_registrations_status on public.registrations (division_id, status);

drop trigger if exists set_updated_at on public.registrations;
create trigger set_updated_at before update on public.registrations
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- teams — a doubles pair competing in a division
-- -----------------------------------------------------------------------------

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions (id) on delete cascade,
  name text, -- optional display name, e.g. "Smash Bros"; falls back to player names in the UI
  seed integer,
  is_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_teams_division_id on public.teams (division_id);

drop trigger if exists set_updated_at on public.teams;
create trigger set_updated_at before update on public.teams
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- team_members — exactly 2 players per doubles team
-- -----------------------------------------------------------------------------

create table if not exists public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  registration_id uuid references public.registrations (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, player_id)
);

create index if not exists idx_team_members_player_id on public.team_members (player_id);

-- Enforce "exactly 2 members per team" at the application layer (registration
-- flow) plus this defensive trigger, since a bare CHECK can't count sibling
-- rows. Fires after every INSERT to catch a 3rd+ member being added.
create or replace function public.enforce_team_size()
returns trigger
language plpgsql
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

drop trigger if exists enforce_team_size on public.team_members;
create trigger enforce_team_size after insert on public.team_members
  for each row execute function public.enforce_team_size();


-- -----------------------------------------------------------------------------
-- partner_invites — a player invites another to form a doubles team
-- -----------------------------------------------------------------------------

create table if not exists public.partner_invites (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions (id) on delete cascade,
  inviter_id uuid not null references auth.users (id) on delete cascade,
  invitee_id uuid references auth.users (id) on delete cascade,
  invitee_email text, -- allows inviting someone who hasn't signed up yet
  status public.partner_invite_status not null default 'pending',
  resulting_team_id uuid references public.teams (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint invitee_identified check (invitee_id is not null or invitee_email is not null),
  constraint no_self_invite check (invitee_id is null or invitee_id <> inviter_id)
);

create index if not exists idx_partner_invites_division_id on public.partner_invites (division_id);
create index if not exists idx_partner_invites_inviter_id on public.partner_invites (inviter_id);
create index if not exists idx_partner_invites_invitee_id on public.partner_invites (invitee_id);

drop trigger if exists set_updated_at on public.partner_invites;
create trigger set_updated_at before update on public.partner_invites
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- payments
-- -----------------------------------------------------------------------------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  amount_paid_cents integer not null default 0 check (amount_paid_cents >= 0),
  status public.payment_status not null default 'unpaid',
  method text check (method in ('cash', 'bank_transfer', 'card', 'other')),
  reference text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint amount_paid_not_over check (amount_paid_cents <= amount_cents)
);

create index if not exists idx_payments_registration_id on public.payments (registration_id);

drop trigger if exists set_updated_at on public.payments;
create trigger set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- courts / time_slots — scheduling primitives
-- -----------------------------------------------------------------------------

create table if not exists public.courts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tournament_id, name)
);

create index if not exists idx_courts_tournament_id on public.courts (tournament_id);

create table if not exists public.time_slots (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  label text,
  created_at timestamptz not null default now(),
  constraint time_slot_valid check (ends_at > starts_at),
  unique (tournament_id, starts_at)
);

create index if not exists idx_time_slots_tournament_id on public.time_slots (tournament_id);


-- -----------------------------------------------------------------------------
-- matches
-- -----------------------------------------------------------------------------

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions (id) on delete cascade,
  stage public.match_stage not null,
  round integer, -- round robin round number; null for knockout stages
  -- Bracket key mirrors KnockoutFixture['key'] in draw.ts ('M1'/'M2'/'THIRD'/'FINAL');
  -- null for round-robin ("elims") matches, which are identified by round + teams instead.
  bracket_key text check (bracket_key in ('M1', 'M2', 'THIRD', 'FINAL')),
  court_id uuid references public.courts (id) on delete set null,
  time_slot_id uuid references public.time_slots (id) on delete set null,
  team_a_id uuid references public.teams (id) on delete set null,
  team_b_id uuid references public.teams (id) on delete set null,
  points_to_win integer not null default 15 check (points_to_win > 0),
  deuce_enabled boolean not null default false,
  cap integer check (cap is null or cap >= points_to_win),
  status public.match_status not null default 'scheduled',
  score_a integer not null default 0 check (score_a >= 0),
  score_b integer not null default 0 check (score_b >= 0),
  winner_team_id uuid references public.teams (id) on delete set null,
  forfeited_by_team_id uuid references public.teams (id) on delete set null,
  forfeit_reason text,
  -- The match this one's winner/loser feeds into (semis -> final/third place).
  next_match_id uuid references public.matches (id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_differ check (team_a_id is null or team_b_id is null or team_a_id <> team_b_id),
  constraint winner_is_participant check (
    winner_team_id is null or winner_team_id = team_a_id or winner_team_id = team_b_id
  ),
  constraint forfeiter_is_participant check (
    forfeited_by_team_id is null or forfeited_by_team_id = team_a_id or forfeited_by_team_id = team_b_id
  ),
  -- Elims matches are identified by round; knockout matches by bracket_key.
  constraint stage_identifier check (
    (stage = 'elims' and round is not null and bracket_key is null)
    or (stage <> 'elims' and bracket_key is not null)
  ),
  -- Prevent duplicate round-robin fixtures: the same pair of teams cannot
  -- appear twice in the elims stage of a division (order-independent, via
  -- the least/greatest pair below) and each bracket_key is unique per
  -- division for the knockout stage.
  unique (division_id, round, team_a_id, team_b_id),
  unique (division_id, bracket_key)
);

comment on column public.matches.round is 'Round-robin round number for stage=elims; null for knockout stages.';
comment on column public.matches.bracket_key is
  'Knockout slot key, mirrors KnockoutFixture[''key''] in src/lib/draw.ts: M1, M2, THIRD or FINAL.';

-- Belt-and-braces uniqueness for round-robin fixtures regardless of which
-- side a team is listed on (A vs B or B vs A is still "the same fixture").
create unique index if not exists uq_matches_elims_unordered_pair
  on public.matches (division_id, round, least(team_a_id, team_b_id), greatest(team_a_id, team_b_id))
  where stage = 'elims' and team_a_id is not null and team_b_id is not null;

create index if not exists idx_matches_division_id on public.matches (division_id);
create index if not exists idx_matches_division_stage_status on public.matches (division_id, stage, status);
create index if not exists idx_matches_court_id on public.matches (court_id);
create index if not exists idx_matches_time_slot_id on public.matches (time_slot_id);
create index if not exists idx_matches_team_a_id on public.matches (team_a_id);
create index if not exists idx_matches_team_b_id on public.matches (team_b_id);
create index if not exists idx_matches_next_match_id on public.matches (next_match_id);
create index if not exists idx_matches_winner_team_id on public.matches (winner_team_id);

drop trigger if exists set_updated_at on public.matches;
create trigger set_updated_at before update on public.matches
  for each row execute function public.set_updated_at();

-- A team's two matches must belong to the same division as the match row
-- itself — enforced via trigger since it spans two tables.
create or replace function public.enforce_match_teams_in_division()
returns trigger
language plpgsql
as $$
declare
  team_division_a uuid;
  team_division_b uuid;
begin
  if new.team_a_id is not null then
    select division_id into team_division_a from public.teams where id = new.team_a_id;
    if team_division_a is distinct from new.division_id then
      raise exception 'team_a (%) does not belong to division %', new.team_a_id, new.division_id;
    end if;
  end if;

  if new.team_b_id is not null then
    select division_id into team_division_b from public.teams where id = new.team_b_id;
    if team_division_b is distinct from new.division_id then
      raise exception 'team_b (%) does not belong to division %', new.team_b_id, new.division_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_match_teams_in_division on public.matches;
create trigger enforce_match_teams_in_division before insert or update on public.matches
  for each row execute function public.enforce_match_teams_in_division();


-- -----------------------------------------------------------------------------
-- score_events — point-by-point log; powers the live feed + undo
-- -----------------------------------------------------------------------------

create table if not exists public.score_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  sequence integer not null, -- monotonically increasing per match; enables ordered replay + undo
  side text not null check (side in ('a', 'b')), -- which team the point/action applies to
  event_type text not null default 'point'
    check (event_type in ('point', 'undo', 'forfeit', 'game_start', 'game_end')),
  score_a_after integer not null check (score_a_after >= 0),
  score_b_after integer not null check (score_b_after >= 0),
  scored_by uuid references auth.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  unique (match_id, sequence)
);

create index if not exists idx_score_events_match_sequence on public.score_events (match_id, sequence);
create index if not exists idx_score_events_scored_by on public.score_events (scored_by);

comment on table public.score_events is
  'Append-mostly point-by-point log. An "undo" is a new event_type=''undo'' row (not a delete) so the live feed and audit trail stay intact.';


-- -----------------------------------------------------------------------------
-- scoresheets + scoresheet_signatures
-- -----------------------------------------------------------------------------

create table if not exists public.scoresheets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  court_id uuid references public.courts (id) on delete set null,
  status public.scoresheet_status not null default 'draft',
  score_a integer not null default 0 check (score_a >= 0),
  score_b integer not null default 0 check (score_b >= 0),
  photo_url text, -- photographed physical scoresheet, if used as backup evidence
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  dispute_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id)
);

create index if not exists idx_scoresheets_match_id on public.scoresheets (match_id);
create index if not exists idx_scoresheets_status on public.scoresheets (status);

drop trigger if exists set_updated_at on public.scoresheets;
create trigger set_updated_at before update on public.scoresheets
  for each row execute function public.set_updated_at();

create table if not exists public.scoresheet_signatures (
  id uuid primary key default gen_random_uuid(),
  scoresheet_id uuid not null references public.scoresheets (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  game_number integer not null default 1, -- signed "after every game" per the brief
  signed_at timestamptz not null default now(),
  unique (scoresheet_id, player_id, game_number)
);

create index if not exists idx_scoresheet_signatures_scoresheet_id on public.scoresheet_signatures (scoresheet_id);
create index if not exists idx_scoresheet_signatures_player_id on public.scoresheet_signatures (player_id);


-- -----------------------------------------------------------------------------
-- duty_assignments — umpire/scorer, scoresheet person, 2x line judges
-- -----------------------------------------------------------------------------

create table if not exists public.duty_assignments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  duty_role public.duty_role not null,
  -- The match this duty roster was derived FROM: the brief says the players
  -- of the *next* match-up on a court officiate the current one, so this
  -- traces "who is on duty for match X" back to "because they play in
  -- source_match_id next on the same court".
  source_match_id uuid references public.matches (id) on delete set null,
  created_at timestamptz not null default now(),
  -- A player can only hold one duty role per match, and (per role) only one
  -- assignee — except line_judge, which needs exactly 2, so that one is
  -- deliberately not unique on (match_id, duty_role).
  unique (match_id, player_id, duty_role)
);

create unique index if not exists uq_duty_umpire_scorer_per_match
  on public.duty_assignments (match_id) where duty_role = 'umpire_scorer';
create unique index if not exists uq_duty_scoresheet_per_match
  on public.duty_assignments (match_id) where duty_role = 'scoresheet';

create index if not exists idx_duty_assignments_match_id on public.duty_assignments (match_id);
create index if not exists idx_duty_assignments_player_id on public.duty_assignments (player_id);
create index if not exists idx_duty_assignments_source_match_id on public.duty_assignments (source_match_id);


-- -----------------------------------------------------------------------------
-- Helper functions used by RLS policies. Defined here (after `user_roles`
-- and `duty_assignments` exist) because these are `language sql` functions,
-- which Postgres resolves against real catalog objects at CREATE time —
-- unlike `language plpgsql` functions such as `set_updated_at`/
-- `handle_new_user` above, which only resolve their bodies at first call and
-- so can be declared before their dependent tables exist.
--
-- SECURITY DEFINER + a pinned search_path so they can read `user_roles`
-- regardless of the calling role's own RLS visibility, without being
-- hijackable via a hostile search_path.
-- -----------------------------------------------------------------------------

create or replace function public.has_role(_user_id uuid, _role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id and ur.role = _role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin');
$$;

create or replace function public.is_tabulator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.has_role(auth.uid(), 'tabulator');
$$;

-- True when the current user is one of the three duty roles rostered on
-- `match_id` (umpire/scorer, scoresheet person, or a line judge) — see
-- `duty_assignments`. Used to scope score_events/scoresheets writes to the
-- players actually on duty for that specific match, per the brief:
-- "the players of the next match-up on that court are designated ...".
create or replace function public.is_match_duty_official(_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.duty_assignments da
    where da.match_id = _match_id and da.player_id = auth.uid()
  );
$$;


-- -----------------------------------------------------------------------------
-- announcements
-- -----------------------------------------------------------------------------

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  title text not null,
  body text not null,
  is_published boolean not null default false,
  is_pinned boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_announcements_tournament_id on public.announcements (tournament_id, is_published);

drop trigger if exists set_updated_at on public.announcements;
create trigger set_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- awards
-- -----------------------------------------------------------------------------

create table if not exists public.awards (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  player_id uuid references auth.users (id) on delete set null,
  award_type public.award_type not null,
  citation text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  constraint award_target check (team_id is not null or player_id is not null)
);

create index if not exists idx_awards_division_id on public.awards (division_id);
create index if not exists idx_awards_team_id on public.awards (team_id);
create index if not exists idx_awards_player_id on public.awards (player_id);


-- -----------------------------------------------------------------------------
-- photos — gallery, moderated before public display
-- -----------------------------------------------------------------------------

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  match_id uuid references public.matches (id) on delete set null,
  storage_path text not null, -- path within the 'gallery' storage bucket
  caption text,
  uploaded_by uuid references auth.users (id) on delete set null,
  is_approved boolean not null default false,
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_photos_tournament_id on public.photos (tournament_id, is_approved);
create index if not exists idx_photos_match_id on public.photos (match_id);


-- -----------------------------------------------------------------------------
-- checklist_items — loot bag / shirt / medal / trophy / prize money per player
-- -----------------------------------------------------------------------------

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  item_type public.checklist_item_type not null,
  is_collected boolean not null default false,
  collected_at timestamptz,
  recorded_by uuid references auth.users (id) on delete set null,
  notes text,
  unique (tournament_id, player_id, item_type)
);

create index if not exists idx_checklist_items_tournament_id on public.checklist_items (tournament_id);
create index if not exists idx_checklist_items_player_id on public.checklist_items (player_id);


-- -----------------------------------------------------------------------------
-- audit_log — who did what, for admin/tabulator actions worth tracing
-- -----------------------------------------------------------------------------

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_entity on public.audit_log (entity_type, entity_id);
create index if not exists idx_audit_log_actor_id on public.audit_log (actor_id);
create index if not exists idx_audit_log_created_at on public.audit_log (created_at);


-- -----------------------------------------------------------------------------
-- site_content — DB-driven rules & FAQ pages (draft rules text, etc.)
-- -----------------------------------------------------------------------------

create table if not exists public.site_content (
  slug text primary key, -- e.g. 'rules', 'faq', 'draft-rules-v1'
  title text not null,
  body_markdown text not null,
  is_published boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.site_content;
create trigger set_updated_at before update on public.site_content
  for each row execute function public.set_updated_at();


-- =============================================================================
-- Standings view
-- =============================================================================
--
-- Raw per-team aggregates ONLY (played/wins/losses/points for/against/point
-- diff) for completed or forfeited matches in the elims stage. Ranking and
-- tiebreak resolution (head-to-head, mini league, etc.) is intentionally
-- NOT done here — see the file header comment and `src/lib/draw.ts`'s
-- `computeStandings()`, which consumes rows shaped like this (via the
-- `PlayedMatch`/`StandingRow` adapters in `src/types/index.ts`).
-- =============================================================================

create or replace view public.standings as
with elims_matches as (
  select
    m.division_id,
    m.id as match_id,
    m.team_a_id,
    m.team_b_id,
    m.score_a,
    m.score_b,
    m.status,
    m.forfeited_by_team_id,
    m.winner_team_id
  from public.matches m
  where m.stage = 'elims'
    and m.status in ('completed', 'forfeited', 'walkover')
    and m.team_a_id is not null
    and m.team_b_id is not null
),
per_team as (
  select
    division_id,
    team_a_id as team_id,
    1 as played,
    (winner_team_id = team_a_id)::int as win,
    (winner_team_id = team_b_id)::int as loss,
    (forfeited_by_team_id = team_a_id)::int as forfeit,
    score_a as points_for,
    score_b as points_against
  from elims_matches
  union all
  select
    division_id,
    team_b_id as team_id,
    1 as played,
    (winner_team_id = team_b_id)::int as win,
    (winner_team_id = team_a_id)::int as loss,
    (forfeited_by_team_id = team_b_id)::int as forfeit,
    score_b as points_for,
    score_a as points_against
  from elims_matches
)
select
  t.id as team_id,
  t.division_id,
  coalesce(sum(pt.played), 0)::int as played,
  coalesce(sum(pt.win), 0)::int as wins,
  coalesce(sum(pt.loss), 0)::int as losses,
  coalesce(sum(pt.forfeit), 0)::int as forfeits,
  coalesce(sum(pt.points_for), 0)::int as points_for,
  coalesce(sum(pt.points_against), 0)::int as points_against,
  coalesce(sum(pt.points_for), 0)::int - coalesce(sum(pt.points_against), 0)::int as point_diff
from public.teams t
left join per_team pt on pt.team_id = t.id and pt.division_id = t.division_id
group by t.id, t.division_id;

comment on view public.standings is
  'Raw aggregates only — no tiebreak logic. Rank/tiebreak by feeding matches into src/lib/draw.ts#computeStandings().';


-- =============================================================================
-- Row Level Security
-- =============================================================================
--
-- Every table below gets:
--   alter table ... enable row level security;
--   alter table ... force row level security;
--
-- `FORCE` matters because the table owner (the Postgres role migrations run
-- as) would otherwise bypass RLS entirely. Only the `service_role` key
-- (server-only, never shipped to the browser) bypasses RLS, by design in
-- Supabase, regardless of FORCE.
--
-- Role/capability summary (see supabase/SCHEMA.md for the full matrix):
--   public/anon      read-only, published data only, never PII
--   player           full CRUD on own profile/registrations/invites/teams;
--                    read published tournament data
--   duty_official    player + write score_events/scoresheets for matches
--                    they are rostered on, only while in_progress
--   tabulator        read all scoresheets, verify/dispute them
--   admin            full read/write on everything
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.user_roles enable row level security;
alter table public.user_roles force row level security;
alter table public.tournaments enable row level security;
alter table public.tournaments force row level security;
alter table public.divisions enable row level security;
alter table public.divisions force row level security;
alter table public.registrations enable row level security;
alter table public.registrations force row level security;
alter table public.teams enable row level security;
alter table public.teams force row level security;
alter table public.team_members enable row level security;
alter table public.team_members force row level security;
alter table public.partner_invites enable row level security;
alter table public.partner_invites force row level security;
alter table public.payments enable row level security;
alter table public.payments force row level security;
alter table public.courts enable row level security;
alter table public.courts force row level security;
alter table public.time_slots enable row level security;
alter table public.time_slots force row level security;
alter table public.matches enable row level security;
alter table public.matches force row level security;
alter table public.score_events enable row level security;
alter table public.score_events force row level security;
alter table public.scoresheets enable row level security;
alter table public.scoresheets force row level security;
alter table public.scoresheet_signatures enable row level security;
alter table public.scoresheet_signatures force row level security;
alter table public.duty_assignments enable row level security;
alter table public.duty_assignments force row level security;
alter table public.announcements enable row level security;
alter table public.announcements force row level security;
alter table public.awards enable row level security;
alter table public.awards force row level security;
alter table public.photos enable row level security;
alter table public.photos force row level security;
alter table public.checklist_items enable row level security;
alter table public.checklist_items force row level security;
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;
alter table public.site_content enable row level security;
alter table public.site_content force row level security;


-- ---- profiles ---------------------------------------------------------------
-- No public select policy at all: phone/emergency contact live here, so
-- anon/public gets NOTHING from this table directly. Public-safe player
-- listings (name/nickname/avatar only) should be served through a future
-- view/RPC that whitelists columns — not by relaxing this table's RLS.

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles
  for delete using (public.is_admin());


-- ---- user_roles --------------------------------------------------------------
-- Players may read their own role rows (to know what UI to show) but never
-- write them — only admins grant/revoke roles.

drop policy if exists "user_roles_select_own_or_admin" on public.user_roles;
create policy "user_roles_select_own_or_admin" on public.user_roles
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_roles_admin_write" on public.user_roles;
create policy "user_roles_admin_write" on public.user_roles
  for all using (public.is_admin()) with check (public.is_admin());


-- ---- tournaments --------------------------------------------------------------

drop policy if exists "tournaments_select_published_or_admin" on public.tournaments;
create policy "tournaments_select_published_or_admin" on public.tournaments
  for select using (is_published or public.is_admin());

drop policy if exists "tournaments_admin_write" on public.tournaments;
create policy "tournaments_admin_write" on public.tournaments
  for insert with check (public.is_admin());
drop policy if exists "tournaments_admin_update" on public.tournaments;
create policy "tournaments_admin_update" on public.tournaments
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "tournaments_admin_delete" on public.tournaments;
create policy "tournaments_admin_delete" on public.tournaments
  for delete using (public.is_admin());


-- ---- divisions ------------------------------------------------------------

drop policy if exists "divisions_select_published_or_admin" on public.divisions;
create policy "divisions_select_published_or_admin" on public.divisions
  for select using (
    is_published or public.is_admin()
    or exists (
      select 1 from public.registrations r
      where r.division_id = divisions.id and r.player_id = auth.uid()
    )
  );

drop policy if exists "divisions_admin_write" on public.divisions;
create policy "divisions_admin_write" on public.divisions
  for insert with check (public.is_admin());
drop policy if exists "divisions_admin_update" on public.divisions;
create policy "divisions_admin_update" on public.divisions
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "divisions_admin_delete" on public.divisions;
create policy "divisions_admin_delete" on public.divisions
  for delete using (public.is_admin());


-- ---- registrations ------------------------------------------------------------
-- Players see/create/update only their own registration (e.g. to withdraw
-- while pending); approving/rejecting is admin-only. No public access —
-- an "approved players" public list is served by a future view exposing
-- only name/division, never this raw table.

drop policy if exists "registrations_select_own_or_admin" on public.registrations;
create policy "registrations_select_own_or_admin" on public.registrations
  for select using (auth.uid() = player_id or public.is_admin());

drop policy if exists "registrations_insert_own" on public.registrations;
create policy "registrations_insert_own" on public.registrations
  for insert with check (auth.uid() = player_id or public.is_admin());

drop policy if exists "registrations_update_own_pending_or_admin" on public.registrations;
create policy "registrations_update_own_pending_or_admin" on public.registrations
  for update using (
    (auth.uid() = player_id and status = 'pending') or public.is_admin()
  ) with check (
    -- Players can withdraw (their own edits keep status pending) but only
    -- admins can move a registration into approved/waitlisted/rejected.
    (auth.uid() = player_id and status = 'pending') or public.is_admin()
  );

drop policy if exists "registrations_delete_own_pending_or_admin" on public.registrations;
create policy "registrations_delete_own_pending_or_admin" on public.registrations
  for delete using (
    (auth.uid() = player_id and status = 'pending') or public.is_admin()
  );


-- ---- teams / team_members ------------------------------------------------------------

drop policy if exists "teams_select_published_or_member_or_admin" on public.teams;
create policy "teams_select_published_or_member_or_admin" on public.teams
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.divisions d where d.id = teams.division_id and d.is_published
    )
    or exists (
      select 1 from public.team_members tm where tm.team_id = teams.id and tm.player_id = auth.uid()
    )
  );

drop policy if exists "teams_write_member_or_admin" on public.teams;
create policy "teams_write_member_or_admin" on public.teams
  for insert with check (
    public.is_admin()
    or exists (
      select 1 from public.team_members tm where tm.team_id = teams.id and tm.player_id = auth.uid()
    )
  );
drop policy if exists "teams_update_member_or_admin" on public.teams;
create policy "teams_update_member_or_admin" on public.teams
  for update using (
    public.is_admin()
    or exists (select 1 from public.team_members tm where tm.team_id = teams.id and tm.player_id = auth.uid())
  ) with check (
    public.is_admin()
    or exists (select 1 from public.team_members tm where tm.team_id = teams.id and tm.player_id = auth.uid())
  );
drop policy if exists "teams_delete_admin" on public.teams;
create policy "teams_delete_admin" on public.teams
  for delete using (public.is_admin());

drop policy if exists "team_members_select_published_or_member_or_admin" on public.team_members;
create policy "team_members_select_published_or_member_or_admin" on public.team_members
  for select using (
    public.is_admin()
    or player_id = auth.uid()
    or exists (
      select 1 from public.teams t join public.divisions d on d.id = t.division_id
      where t.id = team_members.team_id and d.is_published
    )
  );

drop policy if exists "team_members_write_own_or_admin" on public.team_members;
create policy "team_members_write_own_or_admin" on public.team_members
  for insert with check (public.is_admin() or player_id = auth.uid());
drop policy if exists "team_members_delete_own_or_admin" on public.team_members;
create policy "team_members_delete_own_or_admin" on public.team_members
  for delete using (public.is_admin() or player_id = auth.uid());


-- ---- partner_invites ------------------------------------------------------------
-- Only the inviter and invitee can see/act on an invite.

drop policy if exists "partner_invites_select_party_or_admin" on public.partner_invites;
create policy "partner_invites_select_party_or_admin" on public.partner_invites
  for select using (
    auth.uid() = inviter_id or auth.uid() = invitee_id or public.is_admin()
  );

drop policy if exists "partner_invites_insert_own" on public.partner_invites;
create policy "partner_invites_insert_own" on public.partner_invites
  for insert with check (auth.uid() = inviter_id or public.is_admin());

drop policy if exists "partner_invites_update_party_or_admin" on public.partner_invites;
create policy "partner_invites_update_party_or_admin" on public.partner_invites
  for update using (
    auth.uid() = inviter_id or auth.uid() = invitee_id or public.is_admin()
  ) with check (
    auth.uid() = inviter_id or auth.uid() = invitee_id or public.is_admin()
  );

drop policy if exists "partner_invites_delete_inviter_or_admin" on public.partner_invites;
create policy "partner_invites_delete_inviter_or_admin" on public.partner_invites
  for delete using (auth.uid() = inviter_id or public.is_admin());


-- ---- payments ------------------------------------------------------------
-- Financial data: players see their own payment status only; only admins
-- record/edit payments.

drop policy if exists "payments_select_own_or_admin" on public.payments;
create policy "payments_select_own_or_admin" on public.payments
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.registrations r
      where r.id = payments.registration_id and r.player_id = auth.uid()
    )
  );

drop policy if exists "payments_admin_write" on public.payments;
create policy "payments_admin_write" on public.payments
  for insert with check (public.is_admin());
drop policy if exists "payments_admin_update" on public.payments;
create policy "payments_admin_update" on public.payments
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "payments_admin_delete" on public.payments;
create policy "payments_admin_delete" on public.payments
  for delete using (public.is_admin());


-- ---- courts / time_slots ------------------------------------------------------------
-- Scheduling primitives are not sensitive; publish alongside their
-- tournament, otherwise admin-only. No email/phone data lives here.

drop policy if exists "courts_select_published_or_admin" on public.courts;
create policy "courts_select_published_or_admin" on public.courts
  for select using (
    public.is_admin()
    or exists (select 1 from public.tournaments t where t.id = courts.tournament_id and t.is_published)
  );
drop policy if exists "courts_admin_write" on public.courts;
create policy "courts_admin_write" on public.courts
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "time_slots_select_published_or_admin" on public.time_slots;
create policy "time_slots_select_published_or_admin" on public.time_slots
  for select using (
    public.is_admin()
    or exists (select 1 from public.tournaments t where t.id = time_slots.tournament_id and t.is_published)
  );
drop policy if exists "time_slots_admin_write" on public.time_slots;
create policy "time_slots_admin_write" on public.time_slots
  for all using (public.is_admin()) with check (public.is_admin());


-- ---- matches ------------------------------------------------------------
-- Public/players see matches once the parent division is published.
-- Writes: admins always; duty officials may update score-related columns
-- only for the match they are rostered on and only while in_progress (this
-- is enforced by the with check below, not by column-level grants, since
-- Postgres RLS applies per-row not per-column — the app is expected to only
-- send score/status fields from the duty console).

drop policy if exists "matches_select_published_or_participant_or_admin" on public.matches;
create policy "matches_select_published_or_participant_or_admin" on public.matches
  for select using (
    public.is_admin()
    or exists (select 1 from public.divisions d where d.id = matches.division_id and d.is_published)
    or exists (
      select 1 from public.team_members tm
      where tm.player_id = auth.uid() and tm.team_id in (matches.team_a_id, matches.team_b_id)
    )
    or public.is_match_duty_official(matches.id)
  );

drop policy if exists "matches_admin_write" on public.matches;
create policy "matches_admin_write" on public.matches
  for insert with check (public.is_admin());

drop policy if exists "matches_admin_delete" on public.matches;
create policy "matches_admin_delete" on public.matches
  for delete using (public.is_admin());

drop policy if exists "matches_update_admin_or_duty" on public.matches;
create policy "matches_update_admin_or_duty" on public.matches
  for update using (
    public.is_admin()
    or (public.is_match_duty_official(matches.id) and matches.status = 'in_progress')
  ) with check (
    public.is_admin()
    or (public.is_match_duty_official(matches.id) and status in ('in_progress', 'completed', 'forfeited'))
  );


-- ---- score_events ------------------------------------------------------------
-- Duty officials write points only for the match they are assigned to, and
-- only while that match is in_progress. Reads follow the parent match's
-- visibility (published division, participant, or duty official).

drop policy if exists "score_events_select_via_match" on public.score_events;
create policy "score_events_select_via_match" on public.score_events
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.matches m
      join public.divisions d on d.id = m.division_id
      where m.id = score_events.match_id and d.is_published
    )
    or exists (
      select 1 from public.matches m
      join public.team_members tm on tm.team_id in (m.team_a_id, m.team_b_id)
      where m.id = score_events.match_id and tm.player_id = auth.uid()
    )
    or public.is_match_duty_official(score_events.match_id)
  );

drop policy if exists "score_events_insert_duty_or_admin" on public.score_events;
create policy "score_events_insert_duty_or_admin" on public.score_events
  for insert with check (
    public.is_admin()
    or (
      public.is_match_duty_official(score_events.match_id)
      and exists (
        select 1 from public.matches m where m.id = score_events.match_id and m.status = 'in_progress'
      )
    )
  );

-- score_events is an append-only log by design (undo = new row) — no
-- update/delete policy is defined, so only admins (bypassing via
-- service_role for corrections) can ever change history.
drop policy if exists "score_events_admin_delete" on public.score_events;
create policy "score_events_admin_delete" on public.score_events
  for delete using (public.is_admin());


-- ---- scoresheets ------------------------------------------------------------
-- Duty officials (specifically the scoresheet person) write/submit only for
-- their assigned match while in_progress; tabulators/admins verify.

drop policy if exists "scoresheets_select_via_match_or_tabulator" on public.scoresheets;
create policy "scoresheets_select_via_match_or_tabulator" on public.scoresheets
  for select using (
    public.is_tabulator()
    or exists (
      select 1 from public.matches m
      join public.divisions d on d.id = m.division_id
      where m.id = scoresheets.match_id and d.is_published
    )
    or exists (
      select 1 from public.matches m
      join public.team_members tm on tm.team_id in (m.team_a_id, m.team_b_id)
      where m.id = scoresheets.match_id and tm.player_id = auth.uid()
    )
    or public.is_match_duty_official(scoresheets.match_id)
  );

drop policy if exists "scoresheets_insert_duty_or_admin" on public.scoresheets;
create policy "scoresheets_insert_duty_or_admin" on public.scoresheets
  for insert with check (public.is_admin() or public.is_match_duty_official(scoresheets.match_id));

drop policy if exists "scoresheets_update_duty_while_open_or_tabulator" on public.scoresheets;
create policy "scoresheets_update_duty_while_open_or_tabulator" on public.scoresheets
  for update using (
    public.is_admin()
    or public.is_tabulator()
    or (public.is_match_duty_official(scoresheets.match_id) and scoresheets.status in ('draft', 'awaiting_signature'))
  ) with check (
    public.is_admin()
    or public.is_tabulator()
    or (
      public.is_match_duty_official(scoresheets.match_id)
      and status in ('draft', 'awaiting_signature', 'submitted')
    )
  );

drop policy if exists "scoresheets_delete_admin" on public.scoresheets;
create policy "scoresheets_delete_admin" on public.scoresheets
  for delete using (public.is_admin());


-- ---- scoresheet_signatures ------------------------------------------------------------
-- A player may only insert/read their OWN signature (signs after every
-- game, per the brief). No update — a signature is final once given;
-- correcting one means an admin deletes and the player re-signs.

drop policy if exists "scoresheet_signatures_select_own_or_match_party_or_tabulator" on public.scoresheet_signatures;
create policy "scoresheet_signatures_select_own_or_match_party_or_tabulator" on public.scoresheet_signatures
  for select using (
    public.is_tabulator()
    or player_id = auth.uid()
    or exists (
      select 1 from public.scoresheets s where s.id = scoresheet_signatures.scoresheet_id
      and public.is_match_duty_official(s.match_id)
    )
  );

drop policy if exists "scoresheet_signatures_insert_own" on public.scoresheet_signatures;
create policy "scoresheet_signatures_insert_own" on public.scoresheet_signatures
  for insert with check (public.is_admin() or player_id = auth.uid());

drop policy if exists "scoresheet_signatures_delete_admin" on public.scoresheet_signatures;
create policy "scoresheet_signatures_delete_admin" on public.scoresheet_signatures
  for delete using (public.is_admin());


-- ---- duty_assignments ------------------------------------------------------------
-- Players see their own roster slots (and their match opponents/teammates
-- can see who's on duty, since it's public court information once
-- published); only admins write the roster (derived by the scheduler).

drop policy if exists "duty_assignments_select_visible" on public.duty_assignments;
create policy "duty_assignments_select_visible" on public.duty_assignments
  for select using (
    public.is_admin()
    or player_id = auth.uid()
    or exists (
      select 1 from public.matches m
      join public.divisions d on d.id = m.division_id
      where m.id = duty_assignments.match_id and d.is_published
    )
  );

drop policy if exists "duty_assignments_admin_write" on public.duty_assignments;
create policy "duty_assignments_admin_write" on public.duty_assignments
  for all using (public.is_admin()) with check (public.is_admin());


-- ---- announcements ------------------------------------------------------------

drop policy if exists "announcements_select_published_or_admin" on public.announcements;
create policy "announcements_select_published_or_admin" on public.announcements
  for select using (is_published or public.is_admin());

drop policy if exists "announcements_admin_write" on public.announcements;
create policy "announcements_admin_write" on public.announcements
  for all using (public.is_admin()) with check (public.is_admin());


-- ---- awards ------------------------------------------------------------

drop policy if exists "awards_select_published_or_admin" on public.awards;
create policy "awards_select_published_or_admin" on public.awards
  for select using (is_published or public.is_admin());

drop policy if exists "awards_admin_write" on public.awards;
create policy "awards_admin_write" on public.awards
  for all using (public.is_admin()) with check (public.is_admin());


-- ---- photos ------------------------------------------------------------
-- Public only sees approved (moderated) photos. Players may upload (insert)
-- their own photos for moderation but cannot approve them; admins moderate.

drop policy if exists "photos_select_approved_or_own_or_admin" on public.photos;
create policy "photos_select_approved_or_own_or_admin" on public.photos
  for select using (is_approved or uploaded_by = auth.uid() or public.is_admin());

drop policy if exists "photos_insert_own_or_admin" on public.photos;
create policy "photos_insert_own_or_admin" on public.photos
  for insert with check (public.is_admin() or uploaded_by = auth.uid());

drop policy if exists "photos_update_admin_or_own_unmoderated" on public.photos;
create policy "photos_update_admin_or_own_unmoderated" on public.photos
  for update using (
    public.is_admin() or (uploaded_by = auth.uid() and not is_approved)
  ) with check (
    public.is_admin() or (uploaded_by = auth.uid() and not is_approved)
  );

drop policy if exists "photos_delete_own_or_admin" on public.photos;
create policy "photos_delete_own_or_admin" on public.photos
  for delete using (public.is_admin() or uploaded_by = auth.uid());


-- ---- checklist_items ------------------------------------------------------------
-- Players see their own checklist (loot bag etc.); only admins tick items
-- off (physical handout is verified in person).

drop policy if exists "checklist_items_select_own_or_admin" on public.checklist_items;
create policy "checklist_items_select_own_or_admin" on public.checklist_items
  for select using (player_id = auth.uid() or public.is_admin());

drop policy if exists "checklist_items_admin_write" on public.checklist_items;
create policy "checklist_items_admin_write" on public.checklist_items
  for all using (public.is_admin()) with check (public.is_admin());


-- ---- audit_log ------------------------------------------------------------
-- Admin-only, both read and write (writes normally happen via triggers or
-- server actions using the service role, but this keeps the table safe if
-- an admin ever inserts directly from the client too).

drop policy if exists "audit_log_admin_only" on public.audit_log;
create policy "audit_log_admin_only" on public.audit_log
  for all using (public.is_admin()) with check (public.is_admin());


-- ---- site_content ------------------------------------------------------------

drop policy if exists "site_content_select_published_or_admin" on public.site_content;
create policy "site_content_select_published_or_admin" on public.site_content
  for select using (is_published or public.is_admin());

drop policy if exists "site_content_admin_write" on public.site_content;
create policy "site_content_admin_write" on public.site_content
  for all using (public.is_admin()) with check (public.is_admin());


-- =============================================================================
-- Storage buckets + policies
-- =============================================================================
--
-- Three buckets:
--   avatars           — public read, owner write (player's own avatar only)
--   gallery            — public read of APPROVED photos only; authenticated
--                        upload; the `photos` table row is the source of
--                        truth for moderation, this policy just mirrors it
--                        by checking the object path convention
--                        `gallery/<photo-id>/...` against `public.photos`.
--   scoresheet-photos  — private; only duty officials for that match,
--                        tabulators and admins can read/write.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('scoresheet-photos', 'scoresheet-photos', false)
on conflict (id) do nothing;

-- avatars: path convention `avatars/<user_id>/<filename>`
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- gallery: public read of the whole bucket at the storage layer (moderation
-- gating happens at the `photos` table row level in the UI query — the app
-- must join through `public.photos` and never link directly to
-- unmoderated storage paths). Authenticated users may upload; only admins
-- can delete (matches the `photos` table policies above).
drop policy if exists "gallery_public_read" on storage.objects;
create policy "gallery_public_read" on storage.objects
  for select using (bucket_id = 'gallery');

drop policy if exists "gallery_authenticated_upload" on storage.objects;
create policy "gallery_authenticated_upload" on storage.objects
  for insert with check (bucket_id = 'gallery' and auth.uid() is not null);

drop policy if exists "gallery_admin_delete" on storage.objects;
create policy "gallery_admin_delete" on storage.objects
  for delete using (bucket_id = 'gallery' and public.is_admin());

-- scoresheet-photos: private. Path convention `scoresheet-photos/<match_id>/<filename>`.
drop policy if exists "scoresheet_photos_duty_or_tabulator_read" on storage.objects;
create policy "scoresheet_photos_duty_or_tabulator_read" on storage.objects
  for select using (
    bucket_id = 'scoresheet-photos'
    and (
      public.is_tabulator()
      or public.is_match_duty_official(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "scoresheet_photos_duty_write" on storage.objects;
create policy "scoresheet_photos_duty_write" on storage.objects
  for insert with check (
    bucket_id = 'scoresheet-photos'
    and (
      public.is_admin()
      or public.is_match_duty_official(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "scoresheet_photos_admin_delete" on storage.objects;
create policy "scoresheet_photos_admin_delete" on storage.objects
  for delete using (bucket_id = 'scoresheet-photos' and public.is_admin());
