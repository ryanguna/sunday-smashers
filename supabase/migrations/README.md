# Migrations

The authoritative migration history will live in the hosted Supabase
project (`supabase_migrations.schema_migrations`) once one is created. To
materialise it here:

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>   # TODO: fill in once the project is created
npx supabase db pull          # writes timestamped .sql files into this folder
```

To push local changes (e.g. new migrations written by hand or via
`npx supabase migration new <name>`) back up to the linked project:

```bash
npx supabase db push
```

`../schema.sql` (once it exists) documents the core tables, RLS model, and
any storage policies in a single readable file, kept in sync with the
applied migrations.

## Status

`0001_initial_schema.sql` defines the full schema (enums, tables, RLS,
storage policies — see `../SCHEMA.md`), but it has not been applied
anywhere yet: there is still no hosted Supabase project. It was validated
locally against a disposable PostgreSQL container with hand-written
stand-ins for `auth.*`/`storage.*`, not a real Supabase instance.

Once a project exists:

1. `npx supabase login && npx supabase link --project-ref <PROJECT_REF>`
2. `npx supabase db push` to apply `0001_initial_schema.sql`.
3. `npx supabase gen types typescript --linked > src/lib/supabase/types.ts`
   to replace the hand-written `Database` type with a generated one (diff
   first — they should match).

Until then, `src/lib/supabase/types.ts` exports a hand-written `Database`
type matching the schema exactly, and
`src/lib/supabase/config.ts#isSupabaseConfigured()` lets the rest of the
app render safely without a live database connection.
