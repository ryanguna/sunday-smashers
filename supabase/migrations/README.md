# Migrations

Files are applied in filename order. Each one is written to be re-runnable
(`drop ... if exists` before `create`, `create or replace`), so applying an
already-applied migration is a no-op rather than an error.

## Status

The hosted project (`xkxsjafexqexnnkyujou`) has `0001`–`0012` applied.
**`0013`, `0014` and `0015` are not applied yet.** The app degrades quietly
rather than crashing when the database is behind — a missing
`division_occupancy` just makes every division report as empty — so nothing
in the UI will tell you the drift is there. Check for it directly:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/division_occupancy?select=division_id&limit=1"
# 200 = 0015 applied, 404 = not applied
```

## Applying them

### The normal route

Needs a login token and the database password, which only the project owner
has:

```bash
npx supabase login
npx supabase link --project-ref xkxsjafexqexnnkyujou
npx supabase db push
```

Note that the CLI expects `<timestamp>_name.sql` filenames and this folder uses
`0001_`-style prefixes, so confirm `db push` picks these up before relying on
it.

### Without the CLI credentials

Generate one script and paste it into the Supabase SQL editor:

```bash
./supabase/migrations/bundle.sh 0013 > /tmp/pending.sql
```

`bundle.sh` concatenates the actual migration files inside a single
transaction, so the bundle cannot drift from this folder. It deliberately does
not write `supabase_migrations.schema_migrations`: that ledger belongs to the
CLI, this project has never run the CLI against the hosted database, and a
partial ledger would make a later `db push` skip the migrations it has no
record of applying.

## Verifying

`supabase/tests/run.sh` replays every migration into a disposable Postgres and
runs the RLS attack suite against it as `anon` and `authenticated`. Run it
after adding a migration — `postgres` bypasses RLS, so unit tests, e2e tests
and schema diffs can all pass while the policies are wide open.

## Regenerating types

`src/lib/supabase/types.ts` is hand-written and must be updated by hand when a
migration adds a table or view (`tsc` will not catch a missing entry until
something reads it). Once the CLI is linked:

```bash
npx supabase gen types typescript --linked > src/lib/supabase/types.ts   # diff first
```

`src/lib/supabase/config.ts#isSupabaseConfigured()` lets the app render without
a database connection at all, which is what CI and demo mode rely on.
