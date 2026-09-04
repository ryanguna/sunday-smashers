# Migrations

Files are applied in filename order. Each one is written to be re-runnable
(`drop ... if exists` before `create`, `create or replace`), so applying an
already-applied migration is a no-op rather than an error.

## Status

The hosted project (`xkxsjafexqexnnkyujou`) has **`0001`–`0016` applied**
(`0013`–`0016` applied 2026-09-04, verified functionally against live).

Check for drift directly — nothing in the UI reports it:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/division_occupancy?select=division_id&limit=1"
# 200 = 0015 applied, 404 = not applied
```

`0016` has no new table or view to probe, so check the trigger instead — try
an entry as a signed-out client before the window opens and you should get a
`check_violation`, not a `pending` row.

Do not assume drift is harmless. While `0013`–`0015` were outstanding the app
did **not** degrade quietly — the application code had been written against
them, so two paths were hard-broken on production:

- `updatePaymentAction` upserts with `onConflict: 'registration_id'`, which
  PostgREST can only compile into `on conflict (registration_id)` if
  `uq_payments_registration` (0013) exists. Without it, recording a payment
  failed outright with `42P10`.
- `submitRegistration` writes `status: 'waitlisted'`, which the pre-0014
  `registrations_insert_own` policy rejected with `42501`. Any player who
  should have been waitlisted could not register at all.

Only 0015 degraded gracefully (a missing `division_occupancy` reads as `[]`,
so divisions merely report empty). **When code lands ahead of a migration,
assume the feature is broken until the migration is applied.**

## Applying them

### The route that works today

`supabase login` stores an access token in the macOS Keychain, which is enough
to run SQL through the Management API. This applies **only** the files you
pass it, which is the important property — see the `db push` warning below.

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
./supabase/migrations/bundle.sh 0013 > /tmp/pending.sql
python3 -c "import json;json.dump({'query':open('/tmp/pending.sql').read()},open('/tmp/p.json','w'))"
curl -s -X POST \
  "https://api.supabase.com/v1/projects/xkxsjafexqexnnkyujou/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data-binary @/tmp/p.json
```

Sanity-check the token points at the right project before writing anything —
the Supabase MCP server in this workspace is bound to a *different* project
(`wanderlog`), and DDL sent there would create badminton tables in the travel
app's database:

```sql
select current_database(),
       (select count(*) from information_schema.tables
        where table_schema='public' and table_name='registrations') as is_smashers;
```

### Do NOT use `supabase db push` here

`supabase_migrations.schema_migrations` has never been written for this
project, so the CLI believes **nothing** has been applied. `db push` would
attempt to replay `0001` onwards — re-running the entire initial schema
against live data. The ledger is deliberately left empty rather than partially
filled, because a partial ledger makes `db push` skip exactly the migrations
it has no record of applying.

### Without any CLI credentials

Generate one script and paste it into the Supabase SQL editor:

```bash
./supabase/migrations/bundle.sh 0013 > /tmp/pending.sql
```

`bundle.sh` concatenates the actual migration files inside a single
transaction, so the bundle cannot drift from this folder.

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
