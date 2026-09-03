# Going live

Everything between an empty Supabase project and players registering for real.

This exists because a committee audit asked a blunt question — *what can a
volunteer genuinely not do without opening the SQL editor?* — and the honest
answer used to be "quite a lot". Most of it has since been built into the app;
what remains below is the irreducible list.

**Read the whole page once before starting.** Steps 1–3 must be done in order.

---

## Where this project has already got to

Steps 1 and 2 are **done** for the live project — recorded here so nobody
repeats them:

| | |
| --- | --- |
| Supabase project | `xkxsjafexqexnnkyujou` (region `ap-southeast-1`) |
| Migrations | every file in `supabase/migrations/` applied; tracked in `supabase_migrations.schema_migrations` |
| Security | the whole RLS attack suite replayed **against this database** and rolled back (`supabase/tests/run.sh`) |
| Storage | all three buckets and ten policies created by migration 0001 |
| Vercel | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` all set |
| Site | https://sunday-smashers.vercel.app — **connected to the real database, no longer in demo mode** |

> **Migrations added since that snapshot have not been pushed.** Compare
> `supabase/migrations/` against `supabase_migrations.schema_migrations` and
> run step 1 again if they differ. The app degrades quietly rather than
> crashing when it is behind — an unapplied `division_occupancy` view simply
> reports every division as empty — so nothing will tell you. Check.

The bootstrap sequence in step 4 has also been rehearsed against this exact
database and rolled back, so it is known to work rather than merely intended
to (`npm run rehearse:first-run` — 8/8).

**What is left: steps 3, 4 and 5.** The site is live but has no organiser
account and no tournament yet, so it currently shows empty states to everyone.

If the key ever has to be replaced (a rotation, a new project), that is one
command — it verifies the key belongs to this project before deploying it:

```bash
./scripts/finish-go-live.sh <publishable-or-anon-key>
```

*Preview* deliberately has **no** Supabase variables, so pull-request previews
stay in demo mode and cannot write to the real tournament. Do not "fix" this.

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
supabase db push          # applies every file in supabase/migrations/
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

That proves the *migrations* are safe. It cannot prove the *deployment* is —
a migration applied out of order, a policy edited in the dashboard or a grant
the platform restored would all slip through. To replay the identical attacks
against the real database, and roll back so it is left untouched:

```bash
SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres' \
  npm run verify:live-db     # expect "51 passed, 0 failed"
```

Use the **session** pooler (port 5432), not the transaction pooler (6543) —
the checks need `set local role` to survive across statements. The connection
string is in the Supabase dashboard under *Connect*.

There is a second suite for the bootstrap path in step 4, which is worth
running because it is the one sequence that cannot be retried in place:
`claim_first_admin` goes inert the moment it succeeds, so the committee gets a
single attempt on the real project. It rehearses two signups, the claim, the
door closing behind it, and an admin creating the tournament — then rolls back:

```bash
SUPABASE_DB_URL='…' npm run rehearse:first-run   # expect "8/8 checks passed"
```

---

## 2. Point the site at the database

In **Vercel › Project › Settings › Environment Variables**, add both of these
to *Production* and *Development* (not *Preview* — see above):

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable (`sb_publishable_…`) or legacy anon key |

Both are already set on the live project — this section is for rebuilding it
from scratch, or pointing the site at a different Supabase project.

Never add the **secret / service-role** key. A `NEXT_PUBLIC_*` variable is
shipped to every browser that loads the site, and that key bypasses row-level
security completely. `scripts/finish-go-live.sh` refuses one on sight, and also
checks the key is accepted by *this* project — a key from another project fails
with a 401 that looks exactly like having set nothing at all.

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
- **Redirect URLs** — add `http://localhost:3000` for local development.

There is no `/auth/callback` route any more; see below.

**Authentication › Sign In / Providers › Email:**

- **Confirm email — OFF.** This is required, not optional. With it on, every
  signup fails at the first screen because there is nowhere for the
  confirmation email to come from.
- **Enable email provider — ON.** The email address is the *username*; it is
  never written to.

### The site sends no email at all — deliberately

**Decision: this tournament runs without email.** The club has no SMTP server
and no sending domain, and every free option we evaluated failed the same
test — it works for the committee and then fails for the actual field of
players.

What was removed as a result: the confirmation email, the password-reset
email, the magic-link sign-in, `/auth/callback`, `/reset-password`, the resend
button, and the five HTML templates that used to live in `supabase/templates/`.
None of it is dormant code — it is gone, so nothing can half-work.

What stays: **the email address**, because Supabase Auth uses it as the login
identity. Players type an address and a password; nothing is ever sent to it.
The signup screen says exactly that, so nobody sits waiting for an inbox.

#### Why not SMS instead?

Reasonable question, since almost every player is on a phone. The answer is
still no, and the blocker is regulatory rather than technical.

- **ACMA's SMS Sender ID Register has been mandatory since 1 July 2026.**
  Alphanumeric sender IDs must be registered against a registered business
  name or ABN. A social badminton group has neither. Unregistered senders are
  not blocked, but they arrive marked **"Unverified"** and land in a separate
  inbox — precisely where a one-time code goes to die.
- **There is no free tier.** Australian SMS is around AUD 0.05 a message. Not
  much money, but it means a card on file for a one-day tournament.
- **Trial accounts repeat the mistake.** Twilio's trial credit only sends to
  *pre-verified* numbers — the same restriction as a Mailgun sandbox, arrived
  at from a different direction.
- **It would not remove the round trip.** An SMS code still means leaving the
  browser, reading a code and typing it back. That is not less friction than
  a password; it is differently shaped friction.

Phone numbers are still collected as *profile* data (`profiles.phone`) for
ringing a pair who have not shown up. That is a different job from
authentication and needs no provider.

#### What is actually lost, stated exactly

**Confirmation.** Nobody proves they own the address they typed, so a player
could register using someone else's. For a club tournament where the committee
reviews every registration in the admin console before approving it, that is a
manageable risk — and the console is where it gets caught.

**Self-service password reset.** This is the real cost. `/forgot-password` no
longer sends anything; it shows the organiser's name and phone number from the
tournament settings and asks the player to get in touch. Make sure those
contact fields are filled in (step 5) or that page is a dead end.

To reset a password for someone, an organiser runs:

```bash
SUPABASE_DB_URL='postgresql://…:5432/postgres' \
  npm run reset:password -- player@example.com 'their-new-password'
```

Then tell them the new password out of band (group chat, in person) and point
them at **`/account/password`**, where they can change it to something only
they know. That page is in the avatar menu under *Change password*, and it is
the only password-change control in the app — it asks for the current password
before accepting a new one.

Add `--dry-run` to confirm you have the right account before changing anything.
The script **refuses to create an account**: if it says "no account with that
email", you have the wrong address, not a broken script.

> Do not use `npm run bootstrap:organiser` for this. It also resets passwords,
> but it *creates* the account when the email doesn't match one — so a typo
> hands the player a password to a brand-new empty account rather than telling
> you the address was wrong. It is for creating the very first organiser
> login, nothing else.

Keep this on a committee laptop, not on a phone — it needs the database URL.

**Authentication › Emails › Templates** — nothing to do. Leave the defaults;
they are never rendered.


**Storage** — nothing to do. Migration 0001 creates all three buckets
(`avatars` and `gallery` public, `scoresheet-photos` private) along with their
ten access policies. Confirm under *Storage* that they exist rather than
creating anything by hand: a bucket made through the dashboard gets no
policies, and uploads to it fail in a way that looks like a bug in the app.

---

## 4. First-run setup — in the app

Everything from here happens at **`/setup`**. No SQL required.

1. **Create the committee account.** Go to `/signup` and register with the
   organiser's email address and a password. No confirmation email is sent —
   you are signed straight in. Write the password down; there is no reset link.
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

### Choose which pages players can see

`/admin/settings/pages` controls which public pages are revealed, grouped by
the phase of the tournament they belong to. Migration 0011 seeds it for
**pre-registration**: schedule, bracket, standings, live scores, TV view,
awards and gallery all start hidden, because on the day entries open none of
them contain anything.

Hidden pages disappear from the header and footer and show a friendly "not
open yet" panel if someone opens a link directly. **This is not access
control** — nothing behind those pages is secret, and the data itself is
protected by row-level security. It exists so an empty standings table never
makes the site look broken.

Organisers still see the real page while it is hidden, with a banner saying so,
which is how you check a page has content in it *before* unwrapping it.

Reveal them roughly in this order:

| When | Turn on |
| --- | --- |
| Entries open | Rules, Register, Players, Pay, Announcements |
| Draw published | Schedule, Bracket, Standings |
| Tournament morning | Live scores, TV view |
| After the last match | Awards, Gallery |

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

**Signing up returns HTTP 500, `"Error sending confirmation email"`.**
*Confirm email* is still switched on in the Supabase dashboard. There is no
SMTP server, so every signup fails here. Turn it off:
*Authentication › Sign In / Providers › Email › Confirm email* → **off**.
Existing stranded accounts are rescued with the bootstrap script below.

**A player has forgotten their password.**
There is no reset email — that is the deliberate trade in step 3.
`/forgot-password` points them at the organiser's phone number from the
tournament settings. An organiser then runs, from a committee laptop:

```bash
SUPABASE_DB_URL='…' npm run bootstrap:organiser -- player@example.com
```

It prints a generated password, or takes one as a second argument. It does
**not** grant admin, so it is safe to run for an ordinary player.

**To create the first committee account without touching the dashboard:**

```bash
SUPABASE_DB_URL='…' npm run bootstrap:organiser -- you@example.com
```

Creates the account already confirmed. It does **not** grant admin — you still
sign in and claim the seat through `/setup`, so the bootstrap keeps its single
audited path.


**"An admin already exists" on `/setup`.**
Someone has already claimed the seat. They can add you from *Settings › Roles*.
