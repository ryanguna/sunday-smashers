-- ===========================================================================
-- 0015 — Enforce division capacity where the race can be settled
--
-- Two problems, one cause: capacity lived only in the browser.
--
-- 1. The count was wrong. `loadRegistrationBundle` measures occupancy from
--    `teams`, because `registrations` is owner-only under RLS and `teams` is
--    readable. But a team row is only created when a partner *accepts* an
--    invite, so through the whole pre-registration period `teams` is
--    approximately zero. Every division reads as empty no matter how many
--    entries have arrived, and `divisionFull` never becomes true.
--
-- 2. Even with a correct count, checking it in the client cannot work. Two
--    players submitting at once both read "one spot left" and both insert.
--    Nothing on the server had an opinion.
--
-- The fix is in two halves.
--
-- `division_occupancy` publishes the aggregate the browser cannot compute for
-- itself. It exposes counts only — no player ids, no names — so it is safe to
-- read with `security_invoker = off`, the same reasoning as
-- `player_directory` in 0009.
--
-- `enforce_division_capacity` runs before insert and, when the division is at
-- its cap, *downgrades the row to 'waitlisted'* rather than raising. Refusing
-- would hand the player a database error at the exact moment the product has
-- a correct answer for them: the waitlist is what capacity overflow is for,
-- and migration 0014 made 'waitlisted' writable. Whoever loses the race gets
-- a queue position, not a stack trace.
--
-- Admins are exempt: the committee overrides caps deliberately, and approving
-- someone off the waitlist is an update, which this trigger does not touch.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- How full is each division, in a form anyone may read.
--
-- Counts entries, not teams. 'rejected' and 'waitlisted' rows are excluded:
-- neither holds a place, and counting the waitlist against the cap would mean
-- the first waitlisted player permanently blocks the spot they are queued for.
-- ---------------------------------------------------------------------------
create or replace view public.division_occupancy
with (security_invoker = off) as
  select
    d.id                                            as division_id,
    d.max_teams,
    count(r.id) filter (
      where r.status in ('pending', 'approved')
    )::integer                                      as registered_players
  from public.divisions d
  left join public.registrations r on r.division_id = d.id
  group by d.id, d.max_teams;

comment on view public.division_occupancy is
  'Per-division entry counts for the registration form. Aggregates only — never add columns that identify a player, since this is deliberately security_invoker=off so the public form can read it.';

revoke all on public.division_occupancy from public, anon, authenticated;
grant select on public.division_occupancy to anon, authenticated;


-- ---------------------------------------------------------------------------
-- The cap itself.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_division_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cap_teams integer;
  taken     integer;
begin
  -- The committee overrides caps on purpose.
  if public.is_admin() then
    return new;
  end if;

  -- Only an entry that claims a place can be pushed off the end of one.
  if new.status is distinct from 'pending' then
    return new;
  end if;

  select max_teams into cap_teams
  from public.divisions
  where id = new.division_id;

  -- No cap set means no cap.
  if cap_teams is null then
    return new;
  end if;

  -- Serialise entries to this division for the rest of the transaction.
  -- Without it two concurrent inserts both read `taken = cap - 1` under READ
  -- COMMITTED and both take the last place, which is the race this trigger
  -- exists to close. Scoped per division, so the two divisions never block
  -- each other.
  perform pg_advisory_xact_lock(hashtext(new.division_id::text));

  select count(*) into taken
  from public.registrations
  where division_id = new.division_id
    and status in ('pending', 'approved');

  -- `max_teams` counts pairs; registrations count players.
  if taken >= cap_teams * 2 then
    new.status := 'waitlisted';
  end if;

  return new;
end;
$$;

comment on function public.enforce_division_capacity is
  'Downgrades an over-cap entry to waitlisted instead of refusing it. Runs before insert so two simultaneous entries cannot both take the last place.';

drop trigger if exists enforce_division_capacity on public.registrations;
create trigger enforce_division_capacity
  before insert on public.registrations
  for each row execute function public.enforce_division_capacity();
