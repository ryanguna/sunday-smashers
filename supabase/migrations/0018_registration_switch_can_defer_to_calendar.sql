-- Let the registration switch say "no opinion", so the calendar actually works.
--
-- `getRegistrationWindow()` was written for three answers: force it open,
-- force it shut, or defer to `registration_opens_at` / `registration_closes_at`.
-- The third is spelled `null`, and this column was `not null default false` --
-- so it could never be given. Every tournament arrived permanently answering
-- "force it shut", and the branch that reads the calendar was dead code.
--
-- The consequence was a silent one, which is what makes it worth a migration
-- rather than a comment: the console's own read-back told the committee
-- "Registration follows the calendar dates below" while the flag beneath it
-- overrode those dates to closed. Opening day would have arrived, the date
-- would have passed, and the sheet would have stayed shut with nothing on
-- screen admitting why.
--
-- Existing `false` values are cleared rather than kept. `false` has never been
-- distinguishable from "nobody touched this" -- there was no other value the
-- column could have held -- so preserving it would preserve a preference no
-- one expressed. Anyone who genuinely wants registration shut can say so, and
-- now it means something when they do.

alter table public.tournaments
  alter column is_registration_open drop not null,
  alter column is_registration_open set default null;

update public.tournaments
set is_registration_open = null
where is_registration_open = false;

comment on column public.tournaments.is_registration_open is
  'Organiser override for the registration sheet. true = open it regardless of the calendar, false = keep it shut regardless, null = follow registration_opens_at / registration_closes_at.';
