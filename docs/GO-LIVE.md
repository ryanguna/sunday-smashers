# Going live

Everything between an empty Supabase project and players registering for real.

This exists because a committee audit asked a blunt question — *what can a
volunteer genuinely not do without opening the SQL editor?* — and the honest
answer used to be "quite a lot". Most of it has since been built into the app;
what remains below is the irreducible list.

**Read the whole page once before starting.** Steps 1–3 must be done in order.

---

## Before you start

You need:

- The Supabase project's **URL** and **anon key** (Project Settings › API).
- Access to the **Vercel** project.
- The email address of whoever will be the first organiser.

You do **not** need the service-role key. Nothing in this app uses it, and it
should never be put in Vercel.

---

## 1. Apply the database migrations

From the repository root, with the Supabase CLI logged in and linked:

```bash
supabase login            # only once per machine
supabase link --project-ref <your-project-ref>
supabase db push          # applies supabase/migrations/0001 … 0010
```

**Do not run `supabase/seed.sql` against the real project.** It inserts 44
fictional players and a demo tournament — useful for a local sandbox, actively
harmful in production.

Sanity check, in the SQL editor:

```sql
select count(*) from public.tournaments;   -- expect 0
select count(*) from auth.users;           -- expect 0
```

If you want to verify the security policies rather than trust them, run the
non-superuser attack suite against a disposable database (needs Docker):

```bash
./supabase/tests/run.sh   # expect "RLS attack suite passed (51 checks)"
```

This matters more than it sounds. `postgres` bypasses row-level security
entirely, so unit tests, end-to-end tests and schema diffs can all pass while
the policies are badly broken — which is exactly how four tournament-day
blockers once hid in plain sight. That suite runs as `anon` and
`authenticated`, which is the only way the policies are real.

---

## 2. Point the site at the database

In **Vercel › Project › Settings › Environment Variables**, add both of these
to *Production*, *Preview* and *Development*:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon/publishable key |

Then **redeploy** — environment variables are read at build time, so an
existing deployment will not pick them up.

Until both are set, the site runs in **demo mode**: it renders bundled sample
data so it is browsable, and every page says so. That is deliberate, but it
means *nothing you type is saved*. Confirm the banner is gone before going
further.

---

## 3. Configure Supabase Auth

**Project Settings › Authentication › URL Configuration:**

- **Site URL** — your production URL, e.g. `https://sunday-smashers.vercel.app`
- **Redirect URLs** — add both:
  - `https://<your-domain>/auth/callback`
  - `http://localhost:3000/auth/callback` (for local development)

Get this wrong and confirmation links bounce people to a broken page.

**Authentication › Email templates** — the defaults work, but they say
"Supabase". Worth ten minutes to make them say Sunday Smashers.

**Storage** — create a public bucket named `photos` if you want the gallery to
accept uploads. The app reads and moderates photos; it does not create the
bucket.

---

## 4. First-run setup — in the app

Everything from here happens at **`/setup`**. No SQL required.

1. **Create the committee account.** Go to `/signup`, register with the
   organiser's email, and confirm it from the email you receive.
2. **Claim the organiser seat.** Go to `/setup` and press *Take the organiser
   seat*. This works **only while the tournament has no organiser at all** —
   the instant one exists, the door closes and further organisers are added
   from *Settings › Roles*. So do this yourself, before sharing the link.
3. **Create the tournament.** The form on `/setup` captures the name, dates,
   venue, entry fee, payment instructions and organiser contact. It saves as a
   **draft** — nothing appears publicly yet.

> **Why `/setup` is not behind the admin login:** on day zero there is no admin
> to log in as. It is safe because the privileged step calls a database
> function that refuses once any admin exists, and creating a tournament is
> gated by row-level security, which only admins satisfy. The page hides what
> you cannot do; the database is what actually stops you.

---

## 5. Fill in the tournament — in the app

In `/admin/settings`, in this order:

1. **Divisions** — Men's Doubles and Women's Doubles. Each carries its own
   format settings (points to win, deuce, tiebreak), seeded from the draft
   rules but fully editable.
2. **Courts** — one row per court in the hall.
3. **Time slots** — use *Generate slots* rather than adding them by hand.
4. **Rules & FAQ** — the rules page renders from the database. It carries a
   *draft* banner until you mark it final.
5. **Prizes and loot bags** — optional, but the landing page reads better with
   them filled in.

---

## 6. Open the doors

Open `/admin/settings`. The first card, **Going live**, holds both switches:

1. **Publish this tournament.** Until this is on, the public site shows the
   built-in placeholder details and `/register` will not accept anyone.
2. **Open the registration sheet now.**

The second switch stays disabled until the first is on, and turning publishing
off takes registration down with it — registration open on an unpublished
tournament is a trap, because the public site reads `tournament_public`, which
only contains published rows, so the flag would never reach a single player.

Fill in the **entry fee** and **payment instructions** on the same page while
you are there: `/pay` is where every "How to pay" button in the app sends
players, and it reads both straight off this row.

The open/closed switch **overrides the calendar**. You do not have to wait for
the configured opening date to arrive — flip it on and the sheet opens, which
is exactly what you want for a test run. Flip it off the moment you start
building the draw.

---

## 7. Test it end to end before telling anyone

Use a real second email address, not the organiser account:

- [ ] Sign up, confirm the email, complete onboarding.
- [ ] Register for a division through the wizard, inviting a partner by email.
- [ ] Sign up as that partner. **The invite should be waiting on their first
      sign-in** — it is claimed automatically by email.
- [ ] Accept it, and confirm the pair appears in `/admin/teams`.
- [ ] Approve the registration and record a payment in `/admin`.
- [ ] Confirm the player's dashboard shows *approved* and *paid*.
- [ ] Build a draw, schedule it, and open `/tv` on the hall's monitor.

Then delete the test rows before the real thing.

---

## Still needs a decision (not a bug — a choice only you can make)

- **The entry fee and the registration closing date** were invented as
  placeholders (`$25`, one week before the event). Both are now editable in the
  app, but nobody has confirmed them.
- **Nothing sends email.** The app never emails anyone: not on approval, not on
  waitlist promotion, not when a partner is invited. Copy that promises
  otherwise should be changed, or a transactional email provider wired in.
  Until then, **the dashboard is the only notification channel** — tell players
  to bookmark it.
- **Tabulator verification is currently ceremonial.** Standings update the
  instant the umpire scores, so confirming a scoresheet changes nothing. Decide
  whether verification should actually gate the standings; the app's own copy
  currently implies it does.
- **Scoresheet signing on one phone.** Four players, some without accounts,
  passing a single device around is awkward. The likely answer is a
  duty-official-witnessed signature rather than per-player PINs — but that is a
  trust decision for the committee, not a technical one.

---

## If something looks wrong

**The admin console shows players I have never heard of.**
The site is in demo mode — the environment variables are missing or the
deployment predates them. Re-check step 2 and redeploy.

**`/register` says pre-registration has not opened.**
Publish the tournament and turn on *Open registration* (step 6). The switch
beats the calendar.

**A confirmation email never arrives.**
Check spam first. The signup screen has a *Resend* button. If the address was
mistyped, use *Wrong email? Start again*.

**"An admin already exists" on `/setup`.**
Someone has already claimed the seat. They can add you from *Settings › Roles*.
