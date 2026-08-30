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

No migrations exist yet — this app has no hosted Supabase project and no
schema. This directory is a placeholder until:

1. A Supabase project is created and its `--project-ref` is known.
2. The `db-schema` work defines tables/RLS and pushes the first migration.

Until then, `src/lib/supabase/types.ts` exports a permissive placeholder
`Database` type, and `src/lib/supabase/config.ts#isSupabaseConfigured()`
lets the rest of the app render safely without a live database connection.
