# Sunday Smashers — Data Model & RLS Reference

This document explains the schema in `schema.sql` /
`migrations/0001_initial_schema.sql`: the table map, the role × capability
RLS matrix, and the reasoning behind the trickier parts of the design.

Everything here describes the **draft v1 rules** quoted in the project
brief — points to win, deuce, qualifying places, and the tiebreak order are
all stored as *data* on `divisions` (not hard-coded), specifically so the
organising committee can tune the format without a schema change.

## Table map

| Table | Purpose |
|---|---|
| `profiles` | 1:1 with `auth.users`. Name, nickname, gender, phone, shirt size, skill level, emergency contact, avatar. **Contains PII — never exposed to anon/public.** |
| `user_roles` | Many-to-many `user_id` ↔ `role` (`public`, `player`, `duty_official`, `tabulator`, `admin`). A player can simultaneously be a duty official for one match and a plain player for the next. |
| `tournaments` | One row per event (the Christmas Mini Tournament). Dates, venue, publish/registration-open flags. |
| `divisions` | Per tournament. Name, gender, and every configurable format setting: `format_kind`, `points_to_win_elims/finals`, `deuce_enabled_elims/finals`, `cap_elims/finals`, `qualifying_places`, `tiebreak_order`. |
| `registrations` | A player's application to a division. `status`: pending/approved/waitlisted/rejected. |
| `teams` | A doubles pair within a division. |
| `team_members` | Exactly 2 players per team (enforced by trigger — see below). |
| `partner_invites` | A player invites another (by user id or email) to team up. |
| `payments` | Entry fee tracking per registration; `unpaid`/`partial`/`paid`. |
| `courts`, `time_slots` | Scheduling primitives for the day. |
| `matches` | A fixture: division, stage, round/bracket_key, court, slot, teams, score, status, winner, forfeit info, `next_match_id` (the knockout link). |
| `score_events` | Point-by-point append log per match — powers the live feed and undo. |
| `scoresheets` | The per-court paper scoresheet's digital record: status, scores, photo, submission/verification metadata. |
| `scoresheet_signatures` | One row per player per game signed. |
| `duty_assignments` | Umpire/scorer, scoresheet person, 2× line judges rostered per match. |
| `announcements` | Admin posts, publishable. |
| `awards` | Champion/runner-up/3rd/4th/sportsmanship/special mention. |
| `photos` | Gallery uploads, moderated before public display. |
| `checklist_items` | Loot bag/shirt/medal/trophy/prize money handout tracking per player. |
| `audit_log` | Free-form admin/tabulator action trail. |
| `site_content` | DB-driven rules/FAQ markdown pages (seeded with the draft rules text). |
| `standings` (view) | Raw per-team aggregates for the elims stage — see "Standings split" below. |

Every table has a `created_at`; most also have `updated_at` maintained by
a shared `set_updated_at()` trigger. Every foreign key has a matching
index, plus extra indexes on the hot paths: `matches` by
`(division_id, stage, status)`, `score_events` by `(match_id, sequence)`.

## Role × capability matrix

| Capability | public/guest | player | duty official | tabulator | admin |
|---|---|---|---|---|---|
| Read published tournaments/divisions/matches/standings/announcements | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read own profile (incl. phone/emergency contact) | ❌ | ✅ (own only) | ✅ (own only) | ✅ (own only) | ✅ (any) |
| Read another player's profile | ❌ | ❌ | ❌ | ❌ | ✅ |
| Register self for a division | ❌ | ✅ | ✅ | ✅ | ✅ |
| Approve/reject/waitlist a registration | ❌ | ❌ | ❌ | ❌ | ✅ |
| Create/manage own team & partner invites | ❌ | ✅ (own) | ✅ (own) | ✅ (own) | ✅ |
| Record/view payments | ❌ | 👁️ own status | 👁️ own status | 👁️ own status | ✅ full |
| Write score_events for a match | ❌ | ❌ | ✅ *only if rostered on that match AND it is `in_progress`* | ❌ | ✅ |
| Create/submit a scoresheet | ❌ | ❌ | ✅ *only own assigned match* | ❌ | ✅ |
| Sign a scoresheet | ❌ | ✅ (own signature only) | ✅ (own signature only) | ✅ (own signature only) | ✅ |
| Verify/dispute a submitted scoresheet | ❌ | ❌ | ❌ | ✅ | ✅ |
| Upload gallery photo (pending moderation) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Approve/moderate a photo | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage announcements/awards/checklist/site content | ❌ | ❌ | ❌ | ❌ | ✅ |
| Grant/revoke roles | ❌ | ❌ | ❌ | ❌ | ✅ |

`public`/`guest` never sees phone numbers, emergency contacts, emails, or
unmoderated photos — the `profiles`/`registrations`/`payments` tables have
**no public select policy at all** (not even a column-filtered one); a
future public-safe "players in this division" view/RPC should whitelist
columns explicitly rather than relaxing these tables' RLS.

"Duty official" isn't a table `role` you hold indefinitely in the usual
sense — it's derived per match from `duty_assignments`. The
`is_match_duty_official(match_id)` SQL helper checks "is the current user
rostered on this specific match", and RLS policies on `score_events` /
`scoresheets` / `matches` gate writes on that check **and** the match's
`status = 'in_progress'`, so a duty slot only grants write access for the
match it was assigned to, only while it's live.

## Duty roster derivation

The brief says: *"the players of the next match-up on that court are
designated Umpire/Scorer, Scoresheet person, and 2 Line persons"*. So a
match's duty roster is derived **from a different match** — specifically
the next scheduled fixture on the same court. `duty_assignments.match_id`
is the match being officiated; `duty_assignments.source_match_id` traces
back to the match whose players were rostered (i.e. "why these two
players are on duty here"). The scheduler (owned by the `schedule`/
`duty-roster` work, not this schema) is expected to:

1. Order matches by court + time slot.
2. For match *N* on a court, look at match *N+1* on the same court.
3. Assign its two teams' four players as umpire/scorer, scoresheet person,
   and two line judges for match *N*, writing `source_match_id = N+1's id`.

The schema only enforces the *shape* of a valid roster: one umpire/scorer
and one scoresheet person per match (partial unique indexes), and two line
judges is left to application logic (there's no partial-unique constraint
limiting line judges to exactly two, since Postgres can't express "count =
2" as a single-row constraint — this should be validated at the
scheduler/API layer, matching how `enforce_team_size()` is a defensive
trigger rather than a bare CHECK for teams).

## Scoresheet verification flow

1. **`draft`** — a duty official (the scoresheet person) creates the row
   as the match starts.
2. **`awaiting_signature`** — updated after each game as points are
   recorded; players sign via `scoresheet_signatures` (one row per player
   per `game_number`).
3. **`submitted`** — the scoresheet person hands the (physically signed,
   optionally photographed) sheet to the Tabulator; `submitted_by` /
   `submitted_at` are set. This matches the brief: *"the scoresheet person
   submits the signed scoresheet to the Tabulator at the end of each
   game"* — in practice the digital record is updated continuously, but
   `submitted` marks the final, tabulator-facing handoff.
4. **`verified`** — a tabulator (or admin) cross-checks the submitted
   scores against `score_events` / the match row and marks it verified;
   `verified_by` / `verified_at` are set. This is the point at which the
   match result is considered official for standings purposes.
5. **`disputed`** — a tabulator can instead flag a mismatch, with
   `dispute_reason`, for an admin to resolve manually.

RLS lets a duty official update a scoresheet only while it's in
`draft`/`awaiting_signature` (still being built pitch-side); once
`submitted`, only tabulators/admins can move it to `verified`/`disputed` —
the duty official's write window closes at handoff, matching the
"submits to the Tabulator" step being a handover of authority.

## Forfeit handling

- **On `matches`**: `forfeited_by_team_id` records which team forfeited;
  `status` becomes `forfeited`; `winner_team_id` is set to the opponent
  regardless of any partial score recorded before the forfeit (a late
  arrival's or no-show's partial score doesn't count — the brief says late
  or no-show is an "automatic forfeit of that game").
- **In `src/lib/draw.ts`**: `matchWinner()` checks `forfeitedBy` first and
  short-circuits to the opponent; `computeStandings()` records a forfeit as
  a loss with the stage's `pointsToWin` awarded to the non-forfeiting side
  (so the forfeiting team gains no benefit from points already on the
  board). The `toPlayedMatch()` adapter in `src/types/index.ts` carries
  `forfeited_by_team_id` straight through as `PlayedMatch.forfeitedBy` so
  this logic runs unchanged against real rows.
- **`status = 'walkover'`** is distinct from `'forfeited'`: it's for a bye
  or a no-show *before play starts at all* (no score recorded), whereas
  `'forfeited'` implies the game was under way when the forfeit occurred.
  Both are treated as "decided" by `toPlayedMatch()`.

## Standings split (SQL vs TypeScript)

The `standings` view supplies only raw aggregates — `played`, `wins`,
`losses`, `forfeits`, `points_for`, `points_against`, `point_diff` — for
completed/forfeited/walkover matches in the `elims` stage, one row per team
per division (teams with no results yet still appear, all-zero).

It deliberately does **not** implement ranking or tiebreak resolution
(head-to-head, mini leagues for 3+-way ties, "unresolved" flags for
admin decisions). That entire chain already exists once, fully tested, in
`src/lib/draw.ts#computeStandings()`. Reimplementing it in SQL would mean
maintaining two copies of non-trivial tie-break logic that must never
diverge — instead, the app fetches a division's `elims` matches (or feeds
`standings` view rows through `toStandingRowAggregatesOnly()` in
`src/types/index.ts` for a quick unranked summary), maps them with
`toPlayedMatch()`, and calls `computeStandings()` to get a fully ranked,
tie-broken `StandingRow[]`.

## Storage buckets

| Bucket | Public? | Write access |
|---|---|---|
| `avatars` | Yes (read) | Owner only, path `avatars/<user_id>/...` |
| `gallery` | Yes (read) | Any authenticated user can upload; only admins delete. Moderation gating (`photos.is_approved`) happens at the table level — the app must always link through the `photos` table, never construct raw gallery URLs for unmoderated uploads. |
| `scoresheet-photos` | No | Duty officials assigned to that match (path `scoresheet-photos/<match_id>/...`), tabulators, and admins only. |

## Verification notes

The full `schema.sql` (and the equivalent migration) was validated by
running it against a disposable local PostgreSQL 16 container (via
`docker run postgres:16-alpine`) with minimal hand-written stand-ins for
Supabase's `auth.users`/`auth.uid()` and `storage.buckets`/`storage.objects`
schemas — **not** a real Supabase project, and no network calls to Supabase
were made. The stub script and container were deleted after verification;
they are not part of this repo. `schema.sql` applied cleanly end-to-end
(enums → tables → constraints → triggers → the `standings` view → RLS →
storage policies) and `seed.sql` populated it successfully, including a
sanity check that the `standings` view returns the expected per-team
aggregates for the seeded matches.
