-- ===========================================================================
-- 0017 — Make `registrations.tournament_id` agree with the division
--
-- `registrations` carries both `division_id` and `tournament_id`, and the two
-- foreign keys are independent: nothing has ever checked that the division
-- actually belongs to the tournament named alongside it. The column is pure
-- denormalisation — the division already determines the tournament — so a
-- mismatch is never meaningful, only harmful.
--
-- It matters more after 0016. The window trigger deliberately reads the dates
-- from the *division's* tournament, so a row could be admitted under one
-- tournament's calendar while recording itself as belonging to another. The
-- admin console filters the queue by `tournament_id`, so such a row would be
-- invisible to the committee while still holding its `unique (division_id,
-- player_id)` slot and counting against the division's cap. An entry nobody
-- can see and nobody can approve, occupying a place.
--
-- The fix normalises rather than refuses. `tournament_id` is derived data, so
-- the database can simply compute the right answer instead of raising at a
-- player who has no idea the column exists — and a trigger that only ever
-- corrects can never break the happy path the way a CHECK could. It runs on
-- UPDATE too, so moving an entry between divisions keeps the pair consistent.
-- ===========================================================================

create or replace function public.sync_registration_tournament()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owning_tournament uuid;
begin
  select tournament_id into owning_tournament
  from public.divisions
  where id = new.division_id;

  -- No division: leave the verdict to the foreign key rather than writing null
  -- over a value that is about to be rejected anyway.
  if not found then
    return new;
  end if;

  new.tournament_id := owning_tournament;
  return new;
end;
$$;

comment on function public.sync_registration_tournament() is
  'Derives registrations.tournament_id from the division, since the division already determines it. Corrects rather than refuses, so a mismatched client write cannot fail a player''s entry.';

-- Ordering against the 0016 triggers is irrelevant: both of those resolve the
-- tournament through `division_id` themselves and never read
-- `new.tournament_id`, which is exactly why the mismatch went unnoticed.
drop trigger if exists sync_registration_tournament on public.registrations;
create trigger sync_registration_tournament
  before insert or update of division_id, tournament_id on public.registrations
  for each row execute function public.sync_registration_tournament();


-- ---------------------------------------------------------------------------
-- Repair anything already stored with the wrong pairing.
-- ---------------------------------------------------------------------------
update public.registrations r
set tournament_id = d.tournament_id
from public.divisions d
where d.id = r.division_id
  and r.tournament_id is distinct from d.tournament_id;
