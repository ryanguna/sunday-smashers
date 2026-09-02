#!/usr/bin/env node
/**
 * Sets a player's password for them, because nobody else can.
 *
 * `/forgot-password` tells a locked-out player to message an organiser, who
 * will "set a new password on your account". That sentence had nothing behind
 * it: the tournament sends no email, so Supabase's own reset-link and
 * magic-link flows are both dead ends, and the app has no service-role key, so
 * there is no in-app admin control either. This script is what makes the
 * promise true.
 *
 * It writes `auth.users.encrypted_password` directly using pgcrypto's bcrypt,
 * which is the same scheme GoTrue itself uses, so the account is afterwards
 * indistinguishable from one whose owner changed their own password.
 *
 * Usage:
 *   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres' \
 *     node scripts/set-player-password.mjs player@example.com 'their-new-password'
 *
 * Then tell them the new password out of band and point them at
 * /account/password to change it to something only they know.
 *
 * Pass --dry-run to check the account exists without touching it.
 */
import pg from 'pg';

const MIN_LENGTH = 8; // Matches MIN_PASSWORD_LENGTH in src/lib/password.ts.

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const [email, password] = args.filter((a) => !a.startsWith('--'));

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Set SUPABASE_DB_URL to the session pooler connection string (port 5432).');
  process.exit(1);
}
if (!email || (!password && !dryRun)) {
  console.error("Usage: node scripts/set-player-password.mjs <email> '<new-password>' [--dry-run]");
  process.exit(1);
}
if (!dryRun && password.length < MIN_LENGTH) {
  console.error(`Password must be at least ${MIN_LENGTH} characters — the sign-in form enforces the same.`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const { rows } = await client.query(
    'select id, email, confirmed_at from auth.users where lower(email) = lower($1)',
    [email],
  );

  if (rows.length === 0) {
    // Far more likely than a typo'd password: the address they gave you is
    // not the one they signed up with.
    console.error(`No account with the email ${email}. Check the spelling, or the address they actually signed up with.`);
    process.exitCode = 1;
  } else if (rows.length > 1) {
    console.error(`${rows.length} accounts share that email — refusing to guess. Resolve the duplicates first.`);
    process.exitCode = 1;
  } else if (dryRun) {
    console.log(`Found ${rows[0].email} (${rows[0].id}). Nothing changed.`);
  } else {
    await client.query(
      "update auth.users set encrypted_password = crypt($2, gen_salt('bf')), updated_at = now() where id = $1",
      [rows[0].id, password],
    );
    console.log(`Password set for ${rows[0].email}.`);
    console.log('Tell them out of band, then ask them to change it at /account/password.');
    if (!rows[0].confirmed_at) {
      // An unconfirmed account cannot sign in, so the new password alone
      // would not actually unstick them.
      console.warn('\nWarning: this account is not confirmed, so sign-in will still fail.');
      console.warn('Turn off "Confirm email" in Supabase → Authentication → Providers, or confirm it manually.');
    }
  }
} finally {
  await client.end();
}
