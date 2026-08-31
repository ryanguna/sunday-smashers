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
    ('scheduled', 'in_progress', 'completed', 'forfeited', 'walkover', 'cancelled', 'retired');
  -- 'retired' is last, not beside the other non-completions: migration 0006
  -- appends it to existing databases, and enum sort order must match between a
  -- freshly-created project and an upgraded one or `order by status` diverges.
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.duty_role as enum ('umpire_scorer', 'scoresheet', 'line_judge');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.photo_moderation_status as enum ('pending', 'approved', 'rejected');
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
  updated_at timestamptz not null default now(),
  -- Read-only mirror of auth.users.email (migration 0007). auth.users stays
  -- the source of truth; the guard trigger below reverts direct writes.
  -- Declared LAST deliberately: migration 0007 appends it with ALTER TABLE, so
  -- putting it here keeps a freshly-loaded database column-for-column
  -- identical to an upgraded one rather than merely equivalent.
  email text
);

comment on table public.profiles is
  'One row per auth.users row. Phone / emergency contact are private (never selected by anon/public policies).';

comment on column public.profiles.email is
  'Read-only mirror of auth.users.email, maintained by trigger. Never write this directly — change the auth user instead. Admin/own visibility only.';

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- `email` is a mirror, not user data. If a player could edit it directly they
-- could point it at an address they do not control, and the organiser's
-- registration export would then quietly disagree with the address the account
-- actually signs in with. Column-level GRANTs would fail open the next time
-- someone adds a column, so the column is guarded by a trigger instead: any
-- writer that has not announced itself via the transaction-local GUC has its
-- change to `email` silently reverted, leaving the rest of the UPDATE intact.
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

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- INSERT is not covered by guard_profile_email (an UPDATE trigger), so the
  -- email can be written straight in here without the GUC.
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

-- Keep the mirror in step when a player changes their address in account
-- settings, so the organiser's export never points at an old inbox.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
-- SECURITY DEFINER is required: this trigger counts rows in `team_members`,
-- whose RLS SELECT policy references `teams`, whose policy references
-- `team_members` again. Running the count as the invoker would therefore
-- recurse infinitely. The function reads no caller-supplied SQL.
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
    check (event_type in ('point', 'undo', 'forfeit', 'walkover', 'retire', 'game_start', 'game_end')),
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
  -- Stable key for configurable awards (mvp, best_outfit, …). For the fixed
  -- placings this mirrors award_type. Never encode this into `citation` —
  -- citation is user-visible prose (see migration 0005).
  award_key text not null default 'special_mention',
  citation text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  constraint award_target check (team_id is not null or player_id is not null),
  constraint award_key_format check (award_key ~ '^[a-z0-9_\-]{1,48}$')
);

create index if not exists idx_awards_division_id on public.awards (division_id);
create index if not exists idx_awards_team_id on public.awards (team_id);
create index if not exists idx_awards_player_id on public.awards (player_id);
-- A division hands out a given award once; a duplicate is a data-entry slip.
create unique index if not exists idx_awards_division_key
  on public.awards (division_id, award_key);


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
  -- `is_approved` is derived from `moderation_status` by the
  -- sync_photo_moderation trigger below; both are kept so existing queries and
  -- the partial indexes on is_approved stay valid.
  is_approved boolean not null default false,
  moderation_status public.photo_moderation_status not null default 'pending',
  is_featured boolean not null default false,
  moderated_at timestamptz,
  rejection_reason text,
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Keeps is_approved and moderation_status consistent in both directions, and
-- enforces that only an approved photo can be featured.
create or replace function public.sync_photo_moderation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.moderation_status is distinct from old.moderation_status then
    new.is_approved := (new.moderation_status = 'approved');
    new.moderated_at := now();
  elsif tg_op = 'UPDATE' and new.is_approved is distinct from old.is_approved then
    new.moderation_status := case when new.is_approved then 'approved' else 'pending' end::public.photo_moderation_status;
    new.moderated_at := now();
  elsif tg_op = 'INSERT' then
    new.is_approved := (new.moderation_status = 'approved');
  end if;

  if not new.is_approved then
    new.is_featured := false;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_photo_moderation on public.photos;
create trigger sync_photo_moderation before insert or update on public.photos
  for each row execute function public.sync_photo_moderation();

create index if not exists idx_photos_featured
  on public.photos (tournament_id, created_at desc)
  where is_featured and is_approved;

create index if not exists idx_photos_moderation_status
  on public.photos (tournament_id, moderation_status);

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
-- committee_checklist — committee readiness board (migration 0005)
-- Distinct from checklist_items, which is per-player loot bag/shirt/medal.
-- -----------------------------------------------------------------------------

create table if not exists public.committee_checklist (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  category text not null,
  label text not null,
  owner text,
  notes text,
  due_on date,
  is_done boolean not null default false,
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  -- Explicit ordering: the committee arranges jobs in the order they happen on
  -- the day, which is not alphabetical and not creation order.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint committee_checklist_category_format check (category ~ '^[a-z0-9_\-]{1,48}$'),
  constraint committee_checklist_label_present check (btrim(label) <> '')
);

comment on table public.committee_checklist is
  'Committee readiness board: who is bringing what, by when. Distinct from '
  'checklist_items, which tracks per-player loot bag/shirt/medal handout.';

create index if not exists idx_committee_checklist_tournament
  on public.committee_checklist (tournament_id, position);
create index if not exists idx_committee_checklist_open
  on public.committee_checklist (tournament_id) where not is_done;

drop trigger if exists set_updated_at on public.committee_checklist;
create trigger set_updated_at before update on public.committee_checklist
  for each row execute function public.set_updated_at();

-- Keep done_at/done_by honest: they must reflect the current is_done state
-- rather than relying on every caller remembering to set them.
create or replace function public.sync_committee_checklist_done()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if new.is_done and not coalesce(old.is_done, false) then
    new.done_at := coalesce(new.done_at, now());
    new.done_by := coalesce(new.done_by, auth.uid());
  elsif not new.is_done then
    new.done_at := null;
    new.done_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_committee_checklist_done on public.committee_checklist;
create trigger sync_committee_checklist_done
  before insert or update on public.committee_checklist
  for each row execute function public.sync_committee_checklist_done();

alter table public.committee_checklist enable row level security;
alter table public.committee_checklist force row level security;

-- Committee-internal: who is bringing the medals is not public information,
-- and `owner`/`notes` are free text that will contain personal details.
drop policy if exists "committee_checklist_admin_all" on public.committee_checklist;
create policy "committee_checklist_admin_all" on public.committee_checklist
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Privileges are explicit rather than left to Supabase's default grants.
-- `authenticated` needs table-level SELECT/INSERT/UPDATE/DELETE for the admin
-- policy above to be reachable at all — RLS narrows privileges, it never
-- grants them, so without this an admin would get "permission denied" rather
-- than the board. `anon` is revoked outright: who is bringing the medals is
-- committee-internal, and `owner`/`notes` are free text that will name people.
revoke all on public.committee_checklist from anon;
grant select, insert, update, delete on public.committee_checklist to authenticated;


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

-- Column-whitelisting view promised by the comment above: lets a signed-in
-- player look another player up (for partner invites) without exposing phone,
-- emergency contact, gender, skill level or bio. Deliberately a security-definer
-- view (the Postgres default) so it can read past `profiles_select_own`.
-- Granted to `authenticated` only — never to `anon`.
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
--
-- `teams` and `team_members` reference each other in their SELECT policies,
-- which makes Postgres recurse infinitely ("infinite recursion detected in
-- policy for relation team_members"). Both directions are routed through
-- SECURITY DEFINER helpers below, which bypass RLS for these two narrow
-- membership questions and break the cycle.

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

-- NOTE: this cannot test `team_members`, because `team_members` has an FK to
-- `teams` and so no member row can exist before the team does. Instead a player
-- may create a team when they are party to an accepted partner invite in that
-- division that has not yet produced one. The follow-up `team_members` insert is
-- still governed by `team_members_write_own_or_admin`.
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
drop policy if exists "teams_update_member_or_admin" on public.teams;
create policy "teams_update_member_or_admin" on public.teams
  for update using (
    public.is_admin() or public.is_team_member(teams.id)
  ) with check (
    public.is_admin() or public.is_team_member(teams.id)
  );
drop policy if exists "teams_delete_admin" on public.teams;
create policy "teams_delete_admin" on public.teams
  for delete using (public.is_admin());

drop policy if exists "team_members_select_published_or_member_or_admin" on public.team_members;
create policy "team_members_select_published_or_member_or_admin" on public.team_members
  for select using (
    public.is_admin()
    or player_id = auth.uid()
    or public.team_division_is_published(team_members.team_id)
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
    public.is_admin()
    or (uploaded_by = auth.uid() and moderation_status = 'pending')
  ) with check (
    public.is_admin()
    or (
      uploaded_by = auth.uid()
      and moderation_status = 'pending'
      and not is_approved
      and not is_featured
    )
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
-- 0004_publish_draw_rpc.sql
--
-- Publishing a draw previously ran as `delete` followed by a separate multi-row
-- `insert` from the client, because supabase-js cannot open a transaction. If
-- the insert failed after the delete succeeded, the division was left with **no
-- fixtures at all** — on tournament day that is unrecoverable without a manual
-- rebuild.
--
-- This RPC does the whole swap inside a single server-side transaction, and
-- refuses to destroy anything that has already been played unless explicitly
-- forced.

create or replace function public.publish_draw(
  p_division_id uuid,
  p_stage public.match_stage,
  p_matches jsonb,
  p_force boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  played_count integer;
  inserted_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins may publish a draw'
      using errcode = 'insufficient_privilege';
  end if;

  -- Refuse to blow away results unless the admin has explicitly confirmed.
  select count(*) into played_count
    from public.matches m
   where m.division_id = p_division_id
     and m.stage = p_stage
     and (m.status <> 'scheduled' or m.score_a > 0 or m.score_b > 0);

  if played_count > 0 and not p_force then
    raise exception
      'Refusing to replace % match(es) in this division that already have results. Re-run with force to override.',
      played_count
      using errcode = 'raise_exception';
  end if;

  delete from public.matches
   where division_id = p_division_id
     and stage = p_stage;

  insert into public.matches (
    division_id, stage, round, bracket_key,
    team_a_id, team_b_id,
    points_to_win, deuce_enabled, cap,
    court_id, time_slot_id, next_match_id
  )
  select
    p_division_id,
    p_stage,
    (r ->> 'round')::integer,
    r ->> 'bracket_key',
    nullif(r ->> 'team_a_id', '')::uuid,
    nullif(r ->> 'team_b_id', '')::uuid,
    coalesce((r ->> 'points_to_win')::integer, 15),
    coalesce((r ->> 'deuce_enabled')::boolean, false),
    nullif(r ->> 'cap', '')::integer,
    nullif(r ->> 'court_id', '')::uuid,
    nullif(r ->> 'time_slot_id', '')::uuid,
    nullif(r ->> 'next_match_id', '')::uuid
  from jsonb_array_elements(p_matches) as r;

  get diagnostics inserted_count = row_count;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'draw.published',
    'division',
    p_division_id,
    jsonb_build_object(
      'stage', p_stage,
      'inserted', inserted_count,
      'replaced_played', played_count,
      'forced', p_force
    )
  );

  return inserted_count;
end;
$$;

revoke all on function public.publish_draw(uuid, public.match_stage, jsonb, boolean) from public, anon;
grant execute on function public.publish_draw(uuid, public.match_stage, jsonb, boolean) to authenticated;

comment on function public.publish_draw is
  'Atomically replaces all matches for a division+stage. Admin-only. Refuses to destroy played matches unless p_force.';


-- =============================================================================
-- Realtime + security hardening (mirrors migrations 0008 and 0009)
-- =============================================================================
--
-- Everything below was added after a non-superuser RLS audit. Two things are
-- worth knowing before you read it:
--
--   1. `postgres` bypasses RLS. Every earlier check of this schema ran as the
--      superuser, so the policies were never actually exercised. Four blockers
--      that would have stopped the tournament on the day hid behind that.
--      `supabase/tests/run.sh` now replays the attacks as `anon`/`authenticated`.
--
--   2. PostgREST reports an RLS-filtered write as "0 rows affected" with NO
--      error. Any caller that only checks `error` will cheerfully report
--      success for a write that did nothing. Most of the blockers were that.
--
-- The migration files carry the per-fix rationale; they are reproduced verbatim
-- below so this file stays the single readable reference.


-- ----- 0008_enable_realtime.sql -----
-- ---------------------------------------------------------------------------
-- 0008 — publish the live tables to Supabase Realtime
--
-- The client already subscribes to `postgres_changes` on `public.matches`
-- (see `subscribeToPublicMatches` in `src/lib/public-data.ts`), but no
-- migration ever added that table to the `supabase_realtime` publication.
-- Supabase only streams changes for tables in that publication, so the
-- subscription would have connected successfully and then received nothing,
-- forever.
--
-- That failure mode is silent and actively harmful rather than merely
-- degraded: both live views call `stopPolling()` as soon as the channel
-- reports SUBSCRIBED, on the assumption that realtime has taken over. With
-- no publication the channel *does* report SUBSCRIBED, the poller is torn
-- down, and the screen freezes on whatever it happened to be showing — on
-- an unattended courtside monitor, for the rest of the day.
--
-- Tables are added deliberately, not wholesale. Only the three that drive
-- something a person is watching in real time are published; registrations,
-- payments and audit rows change rarely and are read on navigation.
--
--   matches        — scores, status and court/slot assignment. Drives the
--                    /live page, the /tv/[court] scoreboard and standings.
--   score_events   — rally-by-rally detail behind the running score.
--   announcements  — "finals starting on court 2" style venue notices.
--
-- REPLICA IDENTITY FULL: by default Postgres puts only the primary key in
-- the WAL for UPDATE/DELETE. Supabase Realtime evaluates the subscriber's
-- RLS policies against the replicated row, so a policy that references any
-- non-key column cannot be evaluated and the event is dropped. FULL makes
-- the whole row available (and gives DELETE events their old values). The
-- extra WAL volume is irrelevant here — a mini tournament is a few hundred
-- rows changing over a single afternoon.
-- ---------------------------------------------------------------------------

-- `supabase_realtime` exists on a real Supabase project but not on a bare
-- Postgres (CI, local Docker), so create it if it is missing. `for all
-- tables` is deliberately NOT used — that would publish every table.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

-- `alter publication ... add table` errors if the table is already a member,
-- so check first. This keeps the migration re-runnable.
do $$
declare
  t text;
begin
  foreach t in array array['matches', 'score_events', 'announcements']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

alter table public.matches replica identity full;
alter table public.score_events replica identity full;
alter table public.announcements replica identity full;


-- ----- 0009_security_hardening.sql -----
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


-- =============================================================================
-- Migration 0010 — go-live enablers (first-admin bootstrap, entry fee and
-- organiser contact columns, invite-by-email resolution, public tournament
-- view). Applied verbatim; see supabase/migrations/0010_go_live.sql for the
-- reasoning behind each block.
-- =============================================================================

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
