-- Give the tournament day a start and end time.
--
-- `tournament_date` is a `date`. It has never been able to hold a time, and
-- nothing else on the row carried one either -- `doors_open_at` is a separate
-- (and unset) idea, and it answers "when can I get in", not "when do I play".
-- So the whole site could only ever say "Sunday, 13 December 2026" and leave
-- everyone to guess whether that meant a morning or an all-day thing.
--
-- Worse, the console lied about it. Settings renders the field as a
-- `datetime-local` input labelled "Tournament day (first serve)" and reads it
-- back as "Currently Sun, 13 Dec 2026, 11:00 am (Sydney time)". That 11:00 am
-- is fabricated: the bare date parses as UTC midnight and formats in Sydney as
-- 11am. A committee reading that hint would reasonably believe a start time
-- had been saved, and any time they typed into that input was silently
-- discarded on write.
--
-- Stored as `time` rather than `timestamptz` on purpose. This is a wall-clock
-- fact about a hall -- doors at eleven, off the courts by five -- and it is
-- never compared against an instant in another zone. A `timestamptz` would
-- invite exactly the UTC-vs-Sydney drift that produced the phantom 11am
-- above, and would have to be kept in sync with `tournament_date` by hand.
--
-- Nullable, because a tournament genuinely may not have settled its times yet
-- and a defaulted 00:00 would advertise a midnight start.

alter table public.tournaments
  add column if not exists start_time time,
  add column if not exists end_time time;

comment on column public.tournaments.start_time is
  'First serve, as venue wall-clock time. Null means not decided yet -- the site says nothing rather than guessing.';

comment on column public.tournaments.end_time is
  'When play is expected to finish, as venue wall-clock time. Null means not decided yet.';

-- The committee has confirmed 11am to 5pm for the Christmas mini tournament.
-- Only fills rows that have no times set, so re-running this cannot overwrite
-- a later decision.
update public.tournaments
set start_time = coalesce(start_time, time '11:00'),
    end_time = coalesce(end_time, time '17:00');

-- The public view lists its columns explicitly, so a new column on the table
-- is invisible to the anonymous site until it is named here. Without this the
-- times would be saveable in the console and still absent from every page a
-- player reads, which is the same "configured but not shown" gap the times
-- were added to close.
create or replace view public.tournament_public as
select
  id,
  name,
  slug,
  tournament_date,
  doors_open_at,
  registration_opens_at,
  registration_closes_at,
  is_registration_open,
  venue_name,
  venue_address,
  entry_fee_cents,
  payment_instructions,
  contact_name,
  contact_phone,
  contact_email,
  status,
  description,
  -- Appended rather than slotted in beside `tournament_date` where they
  -- belong: `create or replace view` may only add columns at the end, and
  -- dropping the view to reorder would take its grants with it.
  start_time,
  end_time
from public.tournaments t
where is_published;
