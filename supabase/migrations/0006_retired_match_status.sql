-- ---------------------------------------------------------------------------
-- 0006 — retirement as a first-class match outcome, and `cap` on public matches
--
-- Badminton distinguishes three things the schema currently collapses into two:
--
--   * forfeit  — a pair does not play (no-show, ineligible, disqualified)
--   * walkover — the opponent withdrew before play started
--   * retire   — the pair STARTED and stopped mid-game (injury, illness)
--
-- `match_status` had no 'retired', so the scoring console had to record a
-- retirement as status='forfeited' with the distinction carried in
-- forfeit_reason prose ('Retired: rolled an ankle'). That is better than
-- smuggling a marker into an unrelated column, but it still makes
-- "how many pairs retired?" a text search, and it mislabels the pair on the
-- public results page: being carried off with an injury is not a forfeit,
-- and on a small club day that distinction is one people care about.
--
-- Retirement also scores differently. A forfeit/walkover is normalised to
-- points_to_win–0; a retirement keeps the score actually played. Encoding
-- them as the same status makes that rule impossible to express in SQL.
-- ---------------------------------------------------------------------------

-- Enum values cannot be added inside a transaction block in older Postgres,
-- and cannot be dropped at all — so this is deliberately additive.
alter type public.match_status add value if not exists 'retired';

comment on type public.match_status is
  'scheduled | in_progress | completed | forfeited | walkover | retired | cancelled. '
  '"forfeited" and "walkover" mean the match was not played and are normalised to '
  'points_to_win-0; "retired" means play started and stopped, and keeps the score '
  'actually played at the moment of retirement.';

-- ---------------------------------------------------------------------------
-- score_events.event_type
-- ---------------------------------------------------------------------------

alter table public.score_events
  drop constraint if exists score_events_event_type_check;

alter table public.score_events
  add constraint score_events_event_type_check
  check (event_type in ('point', 'undo', 'forfeit', 'walkover', 'retire', 'game_start', 'game_end'));

comment on column public.score_events.event_type is
  'point | undo | forfeit | walkover | retire | game_start | game_end. The rally '
  'log is the source of truth: the scoring console replays it to derive score, '
  'serve rotation and completion, so a terminal event must be distinguishable '
  'from a forfeit rather than inferred from prose.';
