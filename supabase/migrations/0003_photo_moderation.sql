-- 0003_photo_moderation.sql
--
-- The gallery needed two things the `photos` table could not express:
--
--   * a real "featured" flag — it was being encoded as a `[[featured]]` marker
--     appended to `caption`, which risks leaking into captions and alt text;
--   * a distinct **rejected** state — rejection was inferred from
--     `is_approved = false AND approved_by IS NOT NULL`, which is ambiguous and
--     loses the reviewer once a photo is re-reviewed.
--
-- `is_approved` is kept and maintained in sync by a trigger so nothing that
-- already reads it breaks.

create type public.photo_moderation_status as enum ('pending', 'approved', 'rejected');

alter table public.photos
  add column if not exists is_featured boolean not null default false,
  add column if not exists moderation_status public.photo_moderation_status not null default 'pending',
  add column if not exists moderated_at timestamptz,
  add column if not exists rejection_reason text;

-- Backfill from the old derived representation.
update public.photos
   set moderation_status = case
         when is_approved then 'approved'::public.photo_moderation_status
         when approved_by is not null then 'rejected'::public.photo_moderation_status
         else 'pending'::public.photo_moderation_status
       end;

-- Migrate any captions that carried the `[[featured]]` marker.
update public.photos
   set is_featured = true,
       caption = nullif(btrim(replace(caption, '[[featured]]', '')), '')
 where caption like '%[[featured]]%';

-- Keep `is_approved` and `moderation_status` consistent in both directions so
-- existing queries and indexes on `is_approved` remain correct.
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

  -- Only an approved photo may be featured.
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

-- Uploaders may still edit their own photo while it is unmoderated, but must
-- never be able to approve or feature it themselves.
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
