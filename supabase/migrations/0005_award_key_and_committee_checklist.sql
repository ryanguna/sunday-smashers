-- ---------------------------------------------------------------------------
-- 0005 — award_key column, and a real committee checklist table
--
-- Two workarounds the awards/checklist agent was forced into, both of the same
-- shape as the `[[featured]]` caption marker removed in migration 0003:
-- structured state smuggled into a text column because no column existed.
--
--   1. `award_type` is a closed enum, so configurable awards (MVP, Most
--      Improved, Best Christmas Outfit) were stored as `special_mention` with
--      the real key packed into the citation as `[[award:<key>]] text`. That
--      leaks storage syntax into user-visible prose, makes "all MVP awards"
--      unqueryable, and breaks the moment an organiser types a square bracket.
--
--   2. The committee readiness board (owners, due dates, notes) was persisted
--      as a single JSON blob in `site_content`. `checklist_items` could not
--      hold it — that table is per-player loot-bag/shirt/medal tracking, a
--      different thing entirely. A single blob also means last-write-wins:
--      two committee members ticking jobs at once silently lose one another's
--      edits, which is precisely the situation this board exists for.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. awards.award_key
-- ---------------------------------------------------------------------------

alter table public.awards
  add column if not exists award_key text;

comment on column public.awards.award_key is
  'Stable key for configurable awards (e.g. ''mvp'', ''best_outfit''). For the '
  'fixed placings this mirrors award_type. Never encode this in `citation` — '
  'citation is user-visible prose.';

-- Backfill: recover any key already packed into a citation by the old
-- `[[award:<key>]] ...` marker, and strip the marker back out of the prose.
update public.awards
set
  award_key = substring(citation from '\[\[award:([a-z0-9_\-]+)\]\]'),
  citation  = nullif(btrim(regexp_replace(citation, '\[\[award:[a-z0-9_\-]+\]\]', '', 'g')), '')
where citation ~ '\[\[award:[a-z0-9_\-]+\]\]';

-- Everything else: the key is simply the enum value.
update public.awards
set award_key = award_type::text
where award_key is null;

alter table public.awards
  alter column award_key set default 'special_mention';

-- Enforced after backfill so the migration is safe on a populated table.
alter table public.awards
  alter column award_key set not null;

alter table public.awards
  drop constraint if exists award_key_format;
alter table public.awards
  add constraint award_key_format check (award_key ~ '^[a-z0-9_\-]{1,48}$');

-- A division can only hand out a given award once. Placings are inherently
-- unique, and a duplicate "MVP" is a data-entry mistake rather than intent.
create unique index if not exists idx_awards_division_key
  on public.awards (division_id, award_key);

-- ---------------------------------------------------------------------------
-- 2. committee_checklist
-- ---------------------------------------------------------------------------

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
