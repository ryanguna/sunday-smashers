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
