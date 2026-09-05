# Sunday Smashers — Christmas Mini Tournament

The registration, draw, live-scoring and courtside display platform for the
**Sunday Smashers Christmas Mini Tournament** — a Men's & Women's badminton
doubles event held on **13 December 2026**.

---

## What it does

- **Registration** — players sign up as doubles pairs for the Men's and/or
  Women's draw.
- **Draw generation** — round-robin pools followed by semi-finals, seeded
  from registered pairs.
- **Live scoring** — courtside match scores update in real time as points
  are entered.
- **Digital scoresheets** — a tabulator role enters and verifies scores per
  match, replacing paper scoresheets.
- **Courtside TV scoreboard** — a large-format, auto-refreshing view designed
  to be displayed on a TV or monitor next to the courts.
- **Gallery** — photos from the day.
- **Awards** — results and prize/award tracking once the tournament wraps up.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Backend | Supabase — Postgres, Auth, Realtime, Storage |
| Hosting | Vercel |
| Unit tests | Vitest (`src/**/*.test.ts`) |
| E2E tests | Playwright (`e2e/`), desktop + mobile projects |
| Analytics | `@vercel/analytics`, `@vercel/speed-insights` |

---

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase URL + anon key
npm run dev
```

Open http://localhost:3000.

### Demo mode

With no `.env.local` (or empty Supabase variables), the app still renders —
every route is reachable without a backend. This is what CI's `e2e` job runs
against, and it's handy for poking at the UI without a Supabase project.
Once real Supabase credentials are supplied, the app connects to the
database, auth and realtime score updates.

### Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional. Lets an admin issue a one-time password for a locked-out player |

The two `NEXT_PUBLIC_` values are safe to expose client-side; access is
controlled by Postgres row-level security policies.

`SUPABASE_SERVICE_ROLE_KEY` is **not**. It bypasses every RLS policy, is read
server-side only (`src/lib/supabase/admin.ts`), and exists because there is no
mail server here — so password resets happen by an organiser handing over a
one-time password rather than by emailing a link. Leave it unset and the rest
of the app is unaffected; the reset button just explains what to add.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve a production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (single run) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright end-to-end tests (`e2e/`) |

---

## Testing

- **Unit tests** live alongside source as `src/**/*.test.ts` and run with
  Vitest (`npm test`).
- **End-to-end tests** live in `e2e/` and run with Playwright
  (`npm run test:e2e`), across `desktop` and `mobile` projects
  (see `playwright.config.ts`). They run against demo mode (no Supabase
  env needed), so every page must remain reachable without a backend.
  `e2e/smoke.spec.ts` is a placeholder smoke test that just checks the
  homepage responds and renders — replace/extend it as real UI lands.

Before pushing, it's worth running the same checks CI does:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

---

## Supabase workflow

The database schema and migrations live under [`supabase/migrations`](supabase/migrations).

Typical local workflow:

```bash
npx supabase link --project-ref <ref>
npx supabase db pull      # sync schema from the linked project
npx supabase migration new <name>   # add a new migration
npx supabase db push      # apply local migrations to the linked project
```

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for how to provision the Supabase
project and wire it up to GitHub Actions and Vercel.

---

## CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to
`main` and on every pull request:

- **`verify`** — typecheck (`tsc --noEmit`), lint, unit tests, and a
  production build (with Supabase secrets injected so the real build path
  is exercised).
- **`e2e`** — installs Playwright's Chromium browser, builds and boots the
  app **without** Supabase env vars (demo mode), waits for
  `http://localhost:3000` to respond, then runs the Playwright suite.

Deployment to Vercel happens automatically once the repo is linked — see
[`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## Analytics & Speed Insights

`@vercel/analytics` and `@vercel/speed-insights` are already installed as
dependencies. **They are not yet wired up** — `<Analytics />` and
`<SpeedInsights />` need to be added to `src/app/layout.tsx` (owned by
another workstream at the time of writing). Once that lands, analytics data
appears automatically for deployments on Vercel; no extra configuration is
required beyond the package being present.

---

## Project layout

```
src/
  app/            routes (App Router)
  components/     shared UI components
  lib/
    supabase/     Supabase client helpers
  types/          shared TypeScript types
supabase/
  migrations/     SQL migration history
e2e/              Playwright end-to-end tests
```
