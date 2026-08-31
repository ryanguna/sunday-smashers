# Email templates

Festive HTML for the three emails Sunday Smashers actually sends, plus the two
a committee member can trigger by hand from the Supabase dashboard.

## Read this first: they go in Supabase, not Mailgun

Configuring custom SMTP does **not** move templating to Mailgun. Supabase Auth
renders the subject and body itself and then hands the finished message to
Mailgun purely for delivery. Mailgun's own template feature is only used by
messages *you* send through Mailgun's API, and Supabase never calls it.

So:

- **Mailgun** — needs nothing beyond the SMTP credentials already configured,
  a verified sending domain, and SPF/DKIM records so the mail lands in inboxes
  rather than spam.
- **Supabase** — paste these files into
  *Authentication › Emails › Templates*, one per tab, with the subject lines
  below.

## What to paste where

| Supabase template | File | Subject line |
| --- | --- | --- |
| Confirm signup | `confirm-signup.html` | `Confirm your spot — Sunday Smashers 🏸` |
| Magic Link | `magic-link.html` | `Your Sunday Smashers sign-in link 🎄` |
| Reset Password | `reset-password.html` | `Reset your Sunday Smashers password` |
| Invite user | `invite-user.html` | `You're invited to help run Sunday Smashers 🎁` |
| Change Email Address | `change-email.html` | `Confirm your new email address` |

**Reauthentication** is deliberately left at its default: the app never calls
`reauthenticate()`, so that template is never sent.

## Why there is no six-digit code in any of these

Supabase offers `{{ .Token }}`, a six-digit OTP, as an alternative to the
link. Every template here uses `{{ .ConfirmationURL }}` only, because this app
has **no screen anywhere that accepts a typed code**. Offering one would give
a player a number and nowhere to put it. If an OTP entry form is ever built,
add the code to these templates then — not before.

`{{ .ConfirmationURL }}` is also the variable that carries the app's
`redirect_to` through to `/auth/callback`, which is what exchanges the code
for a session. A hand-rolled link built from `{{ .TokenHash }}` would need a
route that does not exist.

## Design notes

- **Tables and inline styles throughout.** Email clients — Outlook above all —
  do not support flexbox, grid, or `<style>` reliably.
- **No images.** Most clients block remote images by default, and a broken
  image in a confirmation email reads as a phishing attempt. The garland under
  the masthead is five table cells with background colours, so it renders
  everywhere, including with images off.
- **Contrast is checked, not guessed.** Body text is ink-soft `#4a3d68` and
  the button is white on pink-dark `#b5196a` (6.34:1). Brand pink `#ff8fc7` is
  decorative only — it is 2.09:1 on white and never carries text. White on
  holly green was measured at 3.96:1 and rejected for the same reason.
- **A visible fallback URL.** Every template repeats the link as plain text,
  because some corporate mail gateways rewrite or strip buttons.
- **Preheader text** is set per email so the inbox preview says something
  useful instead of leaking the first line of markup.
- Colours match `src/app/globals.css`. If the palette there changes, these do
  not follow automatically — they are a copy, living in a different system.

## Changing them

Edit here, commit, then paste into the dashboard. Keeping the source of truth
in the repository means the copy gets reviewed like everything else; the
dashboard is only where it gets deployed.

After editing, send yourself a real one — *Authentication › Users › Invite* or
a password reset to your own address — and read it on a phone before trusting
it to forty players.
