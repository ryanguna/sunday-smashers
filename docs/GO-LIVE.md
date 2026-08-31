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
| Migrations | `0001`–`0010` applied; tracked in `supabase_migrations.schema_migrations` |
| Security | 51/51 RLS attacks replayed **against this database** and rolled back |
| Storage | all three buckets and ten policies created by migration 0001 |
| Vercel | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` all set |
| Site | https://sunday-smashers.vercel.app — **connected to the real database, no longer in demo mode** |

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
- **Redirect URLs** — add both:
  - `https://<your-domain>/auth/callback`
  - `http://localhost:3000/auth/callback` (for local development)

Get this wrong and confirmation links bounce people to a broken page.

### Email delivery — do not skip this one

**Out of the box, Supabase will not email your players at all.** Until a
project has custom SMTP configured, Supabase Auth refuses to deliver to any
address that is not a member of your Supabase *organisation*, and rejects the
rest with *"Email address not authorized"*. It also warns that its built-in
sender "is not meant for production use" and rate-limits it without notice.

So the committee can sign themselves up, conclude it all works, and then watch
every single player fail at the first screen. Pick one of these before
sharing the link:

- **Configure custom SMTP** (*Authentication › Emails › SMTP Settings*) with
  Mailgun, Resend, SendGrid, Postmark or even a Gmail app password. This is the
  real fix: confirmation emails *and* password resets both start working. Also
  raise *Rate Limits › Emails*, which defaults to **30 new users per hour** —
  low enough to matter on the evening registration opens.
- **Or turn off email confirmation** (*Authentication › Sign In / Providers ›
  Email › Confirm email*). Players are signed straight in and land on
  onboarding, no email needed. The catch: **password reset stops working**,
  because that is an email too. Fine for a one-day club tournament, as long as
  you know that is the trade.

**Status: SMTP is configured against a Mailgun account, but on a *sandbox*
sending domain (`sandbox….mailgun.org`), which cannot run the tournament.**

A Mailgun sandbox domain delivers only to **authorized recipients**: at most
**five** addresses, each of which has to click a verification link from
Mailgun first. Everyone else is refused with a permanent SMTP 550, which
reaches the player as a failed signup. With more than five players, most of
the field simply cannot create an account.

It is genuinely useful for *rehearsal* — add your own address as an authorized
recipient and you can walk the whole flow and read the real templates on a
phone. It is not a thing to open registration on.

Before sharing the link with players, do one of:

1. **Add a real sending domain to Mailgun** and publish its SPF and DKIM
   records (*Sending › Domains › Add New Domain*). Best option if the club
   owns a domain. Unverified domains send to spam, which from the player's
   side is indistinguishable from not sending at all.
2. **Use a provider that verifies a single sender address** rather than a
   whole domain — Brevo and Resend both do this on their free tiers, and it
   avoids needing DNS access.
3. **Turn off email confirmation** and accept the trade below.

Because the app sends **no email of its own** — partner invites are in-app
rows, not messages — email is only ever used by Supabase Auth for three
things: confirming a new account, resetting a password, and magic-link
sign-in. Option 3 removes the first and third; only **password reset** is
genuinely lost, and with the event a long way off, "forgot my password" is
the one that will eventually be needed.

The app handles both. With confirmation off it skips the "check your inbox"
screen rather than stranding someone who is already logged in, and if Supabase
refuses the address it says so in plain English instead of showing the raw
error.

**Authentication › Emails › Templates** — festive replacements for the default
"Supabase" wording live in `supabase/templates/`. Paste each file into the
matching tab and copy the subject lines from `supabase/templates/README.md`.

Note that **custom SMTP does not move templating to Mailgun**: Supabase renders
every auth email itself and only uses Mailgun to deliver it. Mailgun's own
template feature is never invoked, so there is nothing to create there.

**Storage** — nothing to do. Migration 0001 creates all three buckets
(`avatars` and `gallery` public, `scoresheet-photos` private) along with their
ten access policies. Confirm under *Storage* that they exist rather than
creating anything by hand: a bucket made through the dashboard gets no
policies, and uploads to it fail in a way that looks like a bug in the app.

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
Check spam first, and use the *Resend* button on the signup screen. If it is
happening to *everyone*, it is almost certainly step 3: with no custom SMTP,
Supabase only emails members of your own organisation and refuses everyone
else. The signup screen says so when it can detect it.

**Signing up returns HTTP 500, `"Error sending confirmation email"`.**
Custom SMTP *is* configured, but the provider rejected the message. Supabase
surfaces this as a bare 500; the signup screen now translates it into "email
delivery isn't working — tell an organiser", but the fix is in the dashboard.

Narrow it down before changing anything, because the two causes need
different fixes.

**Is the sending domain a sandbox?** (`sandbox….mailgun.org`) If so, start
here — a sandbox rejects any recipient not on its **authorized recipients**
list with a permanent SMTP 550, which Supabase reports as this exact 500.

Beware the tempting-but-wrong test: "it fails for *every* address, so it
can't be the sandbox restriction." That inference only holds if one of the
addresses tested was actually *authorized*. A sandbox fails for every
unauthorized address, so testing three strangers' addresses proves nothing.
Test the one address you know is on the list.

**How long does the request take?** Time it:
`curl -o /dev/null -w '%{time_total}\n' -X POST "$URL/auth/v1/signup" …`
Roughly **2 seconds** means Supabase connected and the provider refused —
host and port are fine, so suspect the recipient, the credentials or the
sender address. **10 seconds or more** is a connection timeout: wrong host or
a blocked port.

For Mailgun specifically, in *Authentication › Emails › SMTP Settings*:

| | |
| --- | --- |
| Host | `smtp.mailgun.org` — but `smtp.eu.mailgun.org` if the domain was created in the **EU** region. Getting this wrong is a timeout, not a rejection. |
| Port | `587` |
| Username | the full SMTP login, e.g. `postmaster@mg.yourdomain.com` — *not* your Mailgun account email |
| Password | the domain's **SMTP password** from *Sending › Domain settings › SMTP credentials* — *not* the Mailgun API key |
| Sender email | must be **at the sending domain**. A sender at some other domain is rejected even when the credentials are perfect. |
| Recipient | on a sandbox domain, must be one of the five **authorized recipients**, verified by clicking Mailgun's link |

The exact SMTP reply is in **Supabase › Logs › Auth**; search the `error_id`
from the failed response. Mailgun's own *Sending › Logs* will show the
rejection from its side.

**To unblock setup while email is broken**, either:

- Turn off *Authentication › Sign In / Up › Confirm email*. Accounts then work
  immediately with no email at all. **Turn it back on before registration
  opens** — with it off, anyone can sign up using someone else's address.
- Or create the committee account straight in the database, already confirmed,
  and leave the project's settings alone:

  ```bash
  SUPABASE_DB_URL='…' npm run bootstrap:organiser -- you@example.com
  ```

  It prints a generated password, or takes one as a second argument. It does
  **not** grant admin — you still sign in and claim the seat through `/setup`,
  so the bootstrap keeps its single audited path.

  Re-running it on an existing address confirms that account and resets its
  password, which is also the way to rescue a player stranded on an
  unconfirmed address.

**"An admin already exists" on `/setup`.**
Someone has already claimed the seat. They can add you from *Settings › Roles*.
