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

## Migration 0002 — team creation, player lookup and RLS recursion

Four defects were found while building the registration flow and fixed in
`migrations/0002_team_creation_and_player_lookup.sql` (also folded into
`schema.sql`). All four were verified functionally against a disposable
Postgres 16 container, not just by eye.

1. **`teams_write_member_or_admin` was unsatisfiable on INSERT.** It required an
   existing `team_members` row for the team being created, but `team_members`
   has a foreign key to `teams` — so that row could not exist until the team
   did. No player could ever create a team. A player may now insert a team when
   they are party to an **accepted** `partner_invites` row in that division that
   has not yet produced a team. The subsequent `team_members` insert is still
   governed by `team_members_write_own_or_admin`, so a player can only ever add
   themselves.

2. **No player-to-player lookup existed.** `profiles_select_own` hides every
   other player, so a nickname-based partner invite could not resolve
   `partner_invites.invitee_id`. Added the `public.player_directory` view, which
   whitelists **only** `id`, `full_name`, `nickname` and `avatar_url`. Phone,
   emergency contact, gender, skill level and bio are never exposed.
   It is granted to `authenticated` only — and additionally filters on
   `auth.uid() is not null`, because Supabase's default privileges grant `anon`
   SELECT in `public` and a later blanket `GRANT` would otherwise silently
   re-open it.

3. **`teams` and `team_members` had mutually recursive SELECT policies**, which
   Postgres rejects at runtime with *"infinite recursion detected in policy for
   relation team_members"*. `teams_select_*` queried `team_members` to ask "is
   the caller a member?", while `team_members_select_*` queried `teams` to ask
   "is this division published?". Both questions now go through the
   `SECURITY DEFINER` helpers `public.is_team_member(team_id, player_id)` and
   `public.team_division_is_published(team_id)`, which bypass RLS for those two
   narrow parameterised lookups and break the cycle.

4. **`enforce_team_size()` hit the same recursion** via its own
   `count(*) from team_members`, so it is now `SECURITY DEFINER` with a pinned
   `search_path`.

### Verification performed

| Assertion | Result |
| --- | --- |
| Player with an accepted invite can create a team | pass |
| …and can then insert their own `team_members` row (no recursion) | pass |
| Player **without** an accepted invite is blocked from creating a team | pass |
| Signed-in player can look another up by nickname | pass |
| `player_directory` exposes no contact columns | pass |
| `anon` sees zero rows even after a blanket `GRANT SELECT` | pass |

## Migration 0003 — photo moderation

The gallery had no column for either "featured" or "rejected", so the feature
flag was being encoded as a `[[featured]]` marker appended to `caption` (which
risks leaking into captions and alt text) and rejection was inferred from
`is_approved = false AND approved_by IS NOT NULL` (ambiguous, and it loses the
reviewer on re-review).

Added to `photos`: `moderation_status` (`pending` | `approved` | `rejected`),
`is_featured`, `moderated_at` and `rejection_reason`. `is_approved` is retained
and kept in sync **in both directions** by the `sync_photo_moderation` trigger,
so existing queries and the partial indexes on `is_approved` remain valid. The
trigger also enforces that **only an approved photo can be featured**, and the
migration backfills any captions that carried the old marker.

`photos_update_admin_or_own_unmoderated` was tightened so an uploader can still
edit their own pending photo but can never approve or feature it themselves.

| Assertion | Result |
| --- | --- |
| Featuring a pending photo is forced off | pass |
| Approving syncs `is_approved` and stamps `moderated_at` | pass |
| An approved photo can be featured | pass |
| Rejecting un-features and un-approves | pass |

## Migration 0004 — `publish_draw()` RPC

Publishing a draw ran as a client-side `delete` followed by a separate
multi-row `insert`, because supabase-js cannot open a transaction. If the insert
failed after the delete succeeded, the division was left with **no fixtures at
all** — unrecoverable on tournament day without a manual rebuild.

`public.publish_draw(division_id, stage, matches jsonb, force boolean)` performs
the whole swap in a single server-side transaction. It is `SECURITY DEFINER`,
re-checks `is_admin()` itself, refuses to delete matches that already have
results unless `force` is passed, writes a `draw.published` audit entry, and
returns the number of fixtures inserted. Execute is granted to `authenticated`
only and revoked from `public`/`anon`.

| Assertion | Result |
| --- | --- |
| Non-admin calling `publish_draw` is rejected | pass |
| Admin publish inserts fixtures and writes an audit row | pass |
| Republish over played matches is refused without `force` | pass |
| Republish with `force = true` succeeds | pass |

## Migration 0005 — `award_key` and `committee_checklist`

Two more cases of structured state being smuggled into a text column, the same
shape as the `[[featured]]` caption marker removed in 0003.

**1. `awards.award_key`** — `award_type` is a closed enum, so configurable
awards (MVP, Most Improved, Best Christmas Outfit) were being stored as
`special_mention` with the real key packed into the citation as
`[[award:<key>]] text`. That leaks storage syntax into user-visible prose,
makes "every MVP award" unqueryable, and breaks as soon as an organiser types a
square bracket. The migration adds a real column, backfills it by parsing any
existing marker out of the citation (and strips the marker from the prose),
constrains the format, and adds a unique index so one division cannot hand out
the same award twice.

**2. `public.committee_checklist`** — the committee readiness board (who is
bringing what, by when) was persisted as a single JSON blob in `site_content`.
`checklist_items` could not hold it: that table is per-player loot-bag/shirt/
medal handout, a different thing. A single blob is also last-write-wins — two
committee members ticking jobs at the same time silently lose one another's
edits, which is exactly the scenario the board exists for. A `sync_committee_
checklist_done` trigger keeps `done_at`/`done_by` consistent with `is_done`
rather than trusting every caller to remember.

### Verification (disposable Postgres 16, `supabase/schema.sql` + migration)

| # | Assertion | Result |
|---|---|---|
| 1 | Legacy `[[award:mvp]] Carried the team all day` backfills to `award_key='mvp'`, citation `Carried the team all day` | pass |
| 2 | No `[[award:` marker remains in any citation | pass |
| 3 | Duplicate award key within a division is rejected | pass |
| 4 | Malformed key (`Bad Key!`) rejected by `award_key_format` | pass |
| 5 | Ticking an item auto-stamps `done_at`/`done_by` | pass |
| 6 | Un-ticking clears `done_at`/`done_by` | pass |
| 7 | Blank/whitespace label rejected | pass |
| 8 | `anon` sees 0 rows **even with a blanket `GRANT SELECT`** | pass |
| 9 | Signed-in non-admin sees 0 rows | pass |
| 10 | Admin sees the row | pass |

Assertions 8–10 matter: an earlier draft revoked `anon` but never granted
`authenticated`, so the admin policy was unreachable and an admin would have
got `permission denied` rather than the board. RLS narrows privileges; it never
grants them. Privileges are now explicit rather than left to Supabase defaults.

## Migration 0005 — `award_key` and `committee_checklist`

Two more cases of structured state being smuggled into a text column, the same
shape as the `[[featured]]` caption marker removed in 0003.

**1. `awards.award_key`** — `award_type` is a closed enum, so configurable
awards (MVP, Most Improved, Best Christmas Outfit) were being stored as
`special_mention` with the real key packed into the citation as
`[[award:<key>]] text`. That leaks storage syntax into user-visible prose,
makes "every MVP award" unqueryable, and breaks as soon as an organiser types a
square bracket. The migration adds a real column, backfills it by parsing any
existing marker out of the citation (and strips the marker from the prose),
constrains the format, and adds a unique index so one division cannot hand out
the same award twice.

**2. `public.committee_checklist`** — the committee readiness board (who is
bringing what, by when) was persisted as a single JSON blob in `site_content`.
`checklist_items` could not hold it: that table is per-player loot-bag/shirt/
medal handout, a different thing. A single blob is also last-write-wins — two
committee members ticking jobs at the same time silently lose one another's
edits, which is exactly the scenario the board exists for. A
`sync_committee_checklist_done` trigger keeps `done_at`/`done_by` consistent
with `is_done` rather than trusting every caller to remember.

### Verification (disposable Postgres 16, `supabase/schema.sql` + migration)

| # | Assertion | Result |
|---|---|---|
| 1 | Legacy `[[award:mvp]] Carried the team all day` backfills to `award_key='mvp'`, citation `Carried the team all day` | pass |
| 2 | No `[[award:` marker remains in any citation | pass |
| 3 | Duplicate award key within a division is rejected | pass |
| 4 | Malformed key (`Bad Key!`) rejected by `award_key_format` | pass |
| 5 | Ticking an item auto-stamps `done_at`/`done_by` | pass |
| 6 | Un-ticking clears `done_at`/`done_by` | pass |
| 7 | Blank/whitespace label rejected | pass |
| 8 | `anon` sees 0 rows **even with a blanket `GRANT SELECT`** | pass |
| 9 | Signed-in non-admin sees 0 rows | pass |
| 10 | Admin sees the row | pass |

Assertions 8–10 matter: an earlier draft revoked `anon` but never granted
`authenticated`, so the admin policy was unreachable and an admin would have
got `permission denied` rather than the board. RLS narrows privileges; it never
grants them. Privileges are now explicit rather than left to Supabase defaults.

## Migration 0006 — retirement as a first-class outcome

Badminton distinguishes three things `match_status` collapsed into two:

- **forfeit** — a pair does not play (no-show, ineligible)
- **walkover** — the opponent withdrew before play started
- **retire** — the pair *started* and stopped mid-game (injury, illness)

There was no `'retired'`, so the scoring console recorded a retirement as
`status='forfeited'` with the distinction carried in `forfeit_reason` prose
(`'Retired: rolled an ankle'`). That is better than smuggling a marker into an
unrelated column, but it makes "how many pairs retired?" a text search, and it
mislabels the pair publicly — being carried off injured is not a forfeit, and
on a club day that distinction is one people care about.

It also scores differently: a forfeit/walkover normalises to
`points_to_win`–0, while a retirement keeps the score actually played. Sharing
one status makes that rule impossible to express in SQL.

`score_events.event_type` gained `'walkover'` and `'retire'` for the same
reason — the rally log is the source of truth the console replays, so a
terminal event must be distinguishable rather than inferred from prose.

### Verification (disposable Postgres 16)

| # | Assertion | Result |
|---|---|---|
| 1 | Fresh `schema.sql` loads clean and contains `retired` | pass |
| 2 | `0006` applies to a database built from the *previous* `schema.sql` | pass |
| 3 | `score_events_event_type_check` accepts the two new values | pass |
| 4 | Enum sort order identical between a fresh install and an upgraded one | pass |

Assertion 4 caught a real hazard. `alter type ... add value` appends, so an
upgraded database ordered `… cancelled, retired` while a freshly-created one
ordered `… retired, cancelled`. Any `order by status` would then sort
differently in production than in a fresh environment — the kind of divergence
that only shows up once. `schema.sql` now declares `retired` last to match
what the migration produces.

## Migration 0007 — `profiles.email`

Three separate features independently hit the same wall: player email lives in
`auth.users`, which the anon key cannot read and PostgREST cannot join. The
consequences were practical, not cosmetic — the admin registrations CSV export
(the tool an organiser actually uses to email everyone about start times) had
no address column, and `RolesManager` rendered the literal string
"Email hidden — lives in Supabase auth" where a contact belonged.

`public.profiles` now carries an `email` column. That table is already
own-or-admin under `profiles_select_own`, so nothing became public, and
`player_directory` whitelists columns explicitly so the signed-in partner
lookup still cannot see an address.

**`auth.users` remains the source of truth.** The column is a read-only mirror
kept in step by triggers on signup and on email change. This matters: if a
player could edit `profiles.email` directly they could point it at an address
they do not control, and the organiser's export would then quietly disagree
with the address the account actually signs in with. Contact details that lie
are worse than contact details that are missing.

Column-level `GRANT`s were the obvious tool and the wrong one — revoking a
single column means dropping the table-level `UPDATE` grant and re-granting
every remaining column by name, which fails open the moment someone adds a
column and forgets the list. Instead `guard_profile_email` reverts unauthorised
writes to that one column while letting the rest of the `UPDATE` through, and
the two legitimate writers announce themselves with a transaction-local GUC.
The Update type in `src/lib/supabase/types.ts` also omits `email`, so writing it
is a compile error rather than a write that appears to succeed and is discarded.

### Verification

Validated against disposable `postgres:16` containers on both a fresh
`schema.sql` load and an upgrade from the previous schema.

| # | Assertion | Result |
| --- | --- | --- |
| 1 | Backfill populates rows that predate the column | pass |
| 2 | New signup populates `email` via `handle_new_user` | pass |
| 3 | Changing `auth.users.email` syncs through to `profiles` | pass |
| 4 | A direct write to `profiles.email` is reverted | pass |
| 5 | ...while sibling columns in the same `UPDATE` still save | pass |
| 6 | The GUC does not leak to later statements on the connection | pass |
| 7 | `player_directory` exposes no `email` column | pass |
| 8 | `anon` holds no `SELECT` privilege on `profiles` | pass |
| 9 | A signed-in player can read their own address | pass |
| 10 | ...but cannot read another player's row at all | pass |
| 11 | ...while still seeing that player in `player_directory` | pass |

Assertion 9 failed on first run because the test harness set
`request.jwt.claims` while the `auth.uid()` stub reads
`request.jwt.claim.sub` — a defect in the harness, not the schema.

As with 0006, a fresh install and an upgraded database were compared
column-for-column. `ALTER TABLE` appends, so `schema.sql` declares `email`
**last** rather than beside the other profile fields; the two are now byte
-identical rather than merely equivalent.
