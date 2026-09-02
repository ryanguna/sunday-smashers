-- ===========================================================================
-- 0011 — committee-controlled page visibility
--
-- The site covers the whole tournament lifecycle, but on the day
-- pre-registration opens there is no draw, no schedule, no scores and no
-- photos. A visitor clicking "Standings" three months early gets an empty
-- table and reasonably concludes the site is broken.
--
-- This table lets the committee reveal pages as the tournament reaches them,
-- from /admin/settings/pages, with no redeploy.
--
-- WHAT THIS IS NOT: a security boundary. Nothing behind these pages is
-- secret — the schedule is public the moment it exists — and the underlying
-- rows are already protected by their own RLS policies. Hiding a page only
-- swaps its contents for a "not open yet" panel. Treating it as access
-- control would be a mistake; see src/lib/site-pages.ts.
--
-- WHY A ROW PER PAGE rather than one JSON blob on `tournaments`:
--   * two committee members toggling different pages at the same time don't
--     clobber each other's change, which a read-modify-write of a single JSON
--     column would;
--   * `updated_by` / `updated_at` per page gives the audit trail the rest of
--     the admin console has;
--   * the catalogue of pages is code, not data, so a page that has no row
--     here is simply "never configured" — which reads as visible.
--
-- WHY ABSENT MEANS VISIBLE: the app loads this over the network, and a failed
-- load produces an empty result. Defaulting to hidden would mean a momentary
-- database blip silently blanks the entire navigation — the site would look
-- deleted. Showing a page slightly early is a far smaller problem.
-- ===========================================================================

create table if not exists public.site_page_visibility (
  -- Matches SitePageKey in src/lib/site-pages.ts. Deliberately plain text and
  -- not an enum: the catalogue lives in application code, and adding a page
  -- should be a code change, not a migration. An unknown key here is inert —
  -- nothing reads it — rather than an error.
  page_key    text primary key,
  is_visible  boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

comment on table public.site_page_visibility is
  'Committee switches for which public pages are revealed. Soft gate only — '
  'not access control; see src/lib/site-pages.ts. A missing row means visible.';

comment on column public.site_page_visibility.page_key is
  'Stable key from SitePageKey in src/lib/site-pages.ts. Never rename one — '
  'the value is stored here.';

alter table public.site_page_visibility enable row level security;

-- Anonymous visitors must be able to read this: it decides what the site's
-- own navigation renders, and the header is shown to signed-out visitors.
drop policy if exists "site_page_visibility_public_read" on public.site_page_visibility;
create policy "site_page_visibility_public_read"
  on public.site_page_visibility
  for select
  using (true);

-- Only admins may flip a switch. Written as one policy for all writes because
-- the three verbs have identical rules, and `with check` on top of `using`
-- stops an admin's UPDATE from being turned into an escalation vector.
drop policy if exists "site_page_visibility_admin_write" on public.site_page_visibility;
create policy "site_page_visibility_admin_write"
  on public.site_page_visibility
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.site_page_visibility to anon, authenticated;
grant insert, update, delete on public.site_page_visibility to authenticated;


-- ---------------------------------------------------------------------------
-- Keep `updated_at` honest without trusting the client to send it.
-- ---------------------------------------------------------------------------
create or replace function public.touch_site_page_visibility()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists site_page_visibility_touch on public.site_page_visibility;
create trigger site_page_visibility_touch
  before insert or update on public.site_page_visibility
  for each row
  execute function public.touch_site_page_visibility();


-- ---------------------------------------------------------------------------
-- Seed the pre-registration phase.
--
-- This runs at the point the committee asked for: entries are open, and
-- nothing that depends on a draw, a score or a camera exists yet. Everything
-- not listed keeps the default (visible).
--
-- `on conflict do nothing` so re-running the migration never overwrites a
-- decision the committee has already made in the admin console.
-- ---------------------------------------------------------------------------
insert into public.site_page_visibility (page_key, is_visible) values
  ('schedule',   false),
  ('bracket',    false),
  ('standings',  false),
  ('live',       false),
  ('tv',         false),
  ('awards',     false),
  ('gallery',    false)
on conflict (page_key) do nothing;
