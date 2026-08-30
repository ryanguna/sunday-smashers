# Deployment guide

This project deploys to **Vercel**, backed by a **Supabase** project for the
database, auth and realtime scoring. This guide covers a one-time setup.

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard and create a new project (pick a
   region close to where the tournament will be run/administered).
2. Once provisioned, open **Project Settings → API** and note:
   - **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable / anon key** → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Apply the schema in [`supabase/migrations`](supabase/migrations) to the
   new project:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

## 2. Add secrets to GitHub Actions

CI's `verify` job builds the app with real Supabase credentials so the
production build path is exercised (the `e2e` job intentionally omits them
and relies on demo mode).

In the GitHub repo: **Settings → Secrets and variables → Actions → New
repository secret**, add:

| Secret name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key from step 1 |

## 3. Link the repo to Vercel

1. In the [Vercel dashboard](https://vercel.com/new), import the
   `ryanguna/sunday-smashers` GitHub repository as a new project.
2. Framework preset should auto-detect as **Next.js** — leave build/output
   settings at their defaults (`npm run build`).
3. Vercel will auto-deploy:
   - every push to `main` → **Production**
   - every pull request → a unique **Preview** deployment

## 4. Add environment variables in Vercel

In the Vercel project: **Settings → Environment Variables**, add the same
two variables from step 1, and set them for **all three** environments:

| Variable | Production | Preview | Development |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | ✅ |

Using the same Supabase project across environments is fine for this
tournament's scale; if you want isolated preview data, create a second
Supabase project and only apply its credentials to the Preview/Development
columns.

Redeploy (or push a commit) after adding the variables so they take effect.

## 5. Configure Supabase auth redirect URLs

Once the app has a real deployed domain (e.g. `sunday-smashers.vercel.app`
and/or a custom domain), add it to Supabase so auth flows (magic links,
OAuth, password reset) redirect correctly:

1. In Supabase: **Authentication → URL Configuration**.
2. Set **Site URL** to the production domain, e.g.
   `https://sunday-smashers.vercel.app`.
3. Add each domain you need to the **Redirect URLs** allow-list, including:
   - the production domain (`https://sunday-smashers.vercel.app/**`)
   - any custom domain, once attached
   - `http://localhost:3000/**` for local development
   - Vercel preview deployments if you want auth to work there too — Vercel
     preview URLs are non-deterministic per-PR, so either use a wildcard
     pattern if Supabase supports one for your plan, or accept that auth
     redirects only work reliably on `localhost` and the production domain.

## 6. Verify

- Push to `main` (or open a PR) and confirm the `CI` workflow's `verify` and
  `e2e` jobs both pass.
- Confirm the Vercel deployment succeeds and the Supabase-backed features
  (registration, live scoring) work against the deployed URL.
