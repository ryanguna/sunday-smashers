# Supabase

This directory holds the Supabase project configuration for Sunday
Smashers:

- `schema.sql` — the full, readable reference schema: enums, tables,
  constraints, indexes, triggers, the `standings` view, RLS policies and
  storage bucket policies, heavily commented.
- `migrations/0001_initial_schema.sql` — the same schema as an applied
  migration, for `npx supabase db push`. Keep it in sync with `schema.sql`
  if either changes.
- `seed.sql` — demo data (one tournament, two divisions, 11 pairs each,
  courts/slots, a few played matches, announcements, site content) for
  `npx supabase db reset` / local development.
- `SCHEMA.md` — the data model reference: table map, role × capability RLS
  matrix, and the reasoning behind duty roster derivation, scoresheet
  verification, and forfeit handling.

No hosted Supabase project exists yet, so none of the above has been
pushed anywhere — it was authored and validated locally (see the
"Verification notes" section of `SCHEMA.md`).

The app talks to Supabase through `src/lib/supabase/`:

- `client.ts` — browser client (`createClient()` from a Client Component).
- `server.ts` — server client (`createClient()`, async, from a Server
  Component / Route Handler / Server Action).
- `config.ts` — `isSupabaseConfigured()` + the resolved URL/anon key. Every
  other helper funnels through this so the app never throws when Supabase
  env vars are absent ("demo mode" — required for CI, which builds and runs
  Playwright e2e tests with no Supabase credentials).
- `types.ts` — the generated `Database` type. Currently a permissive
  placeholder; regenerate once real tables exist (see below).
- `src/proxy.ts` — Next.js 16 "proxy" (the renamed `middleware.ts`) that
  refreshes the Supabase session cookie on every request, and no-ops
  entirely when unconfigured.

## One-time project setup (not yet done)

No hosted Supabase project exists yet for Sunday Smashers. Once one is
created:

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>   # fill in once the project exists
npx supabase db pull                            # materialise remote migrations locally
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
`.env.local` (see `.env.local.example`) with the values from the Supabase
dashboard's API settings.

## Applying schema changes

The `db-schema` agent (or whoever owns the schema) should write migrations
under `supabase/migrations/` and apply them with:

```bash
npx supabase db push
```

See `supabase/migrations/README.md` for the day-to-day workflow.

## Regenerating types

Once the schema exists on the linked project:

```bash
npx supabase gen types typescript --linked > src/lib/supabase/types.ts
```

This replaces the placeholder `Database` type in `types.ts` without
requiring any changes to `client.ts` or `server.ts`, which are already
generic over `Database`.
