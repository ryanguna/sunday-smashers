#!/usr/bin/env node
/**
 * Creates a committee account with its email already confirmed, so setup can
 * proceed while email delivery is broken.
 *
 * Supabase will not let anyone sign up while SMTP is refusing mail: the whole
 * request fails, not just the email. That is a deadlock — the one account
 * needed to administer the tournament cannot be created, and the settings
 * that would fix email are behind an account. This writes the account
 * directly instead, exactly as GoTrue would, with `email_confirmed_at` set.
 *
 * It deliberately does NOT grant admin. The organiser still signs in and
 * claims the seat through /setup, so the bootstrap keeps its single audited
 * path and this script stays a way in, not a way to hand out power.
 *
 * Safe to re-run: if the address already exists it confirms that account and
 * resets its password rather than failing or duplicating it. That doubles as
 * the fix for a player stranded by an unconfirmed address.
 *
 * Usage:
 *   SUPABASE_DB_URL='postgresql://…@…:5432/postgres' \
 *     node scripts/bootstrap-organiser.mjs <email> [password]
 *
 * Omit the password and a strong one is generated and printed once.
 */
import pg from 'pg';
import { randomBytes } from 'node:crypto';

const url = process.env.SUPABASE_DB_URL;
const [email, givenPassword] = process.argv.slice(2);

if (!url || !email) {
  console.error('Usage: SUPABASE_DB_URL=… node scripts/bootstrap-organiser.mjs <email> [password]');
  process.exit(2);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`"${email}" does not look like an email address.`);
  process.exit(2);
}

// Avoid characters that get mangled when pasted out of a terminal or chat.
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(20);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('') + '!7';
}

const password = givenPassword || generatePassword();
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

await client.connect();
await client.query('begin');

try {
  const existing = await client.query('select id from auth.users where lower(email) = lower($1)', [email]);

  let userId;
  let action;

  if (existing.rows.length > 0) {
    userId = existing.rows[0].id;
    action = 'updated';
    await client.query(
      `update auth.users
          set encrypted_password = crypt($2, gen_salt('bf')),
              email_confirmed_at = coalesce(email_confirmed_at, now()),
              confirmation_token = coalesce(confirmation_token, ''),
              recovery_token = coalesce(recovery_token, ''),
              email_change_token_new = coalesce(email_change_token_new, ''),
              email_change = coalesce(email_change, ''),
              updated_at = now()
        where id = $1`,
      [userId, password],
    );
  } else {
    action = 'created';
    // The *_token and email_change columns must be '' rather than NULL. GoTrue
    // scans them into plain Go strings, so a NULL makes every sign-in fail with
    // "Database error querying schema" — an error that points at the schema
    // rather than at the row, and sends you looking in the wrong place.
    const inserted = await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                               email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                               confirmation_token, recovery_token,
                               email_change_token_new, email_change,
                               created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               $1, crypt($2, gen_salt('bf')), now(),
               '{"provider":"email","providers":["email"]}'::jsonb, $3::jsonb,
               '', '', '', '',
               now(), now())
       returning id`,
      [email, password, JSON.stringify({ full_name: 'Tournament Organiser', email_verified: true })],
    );
    userId = inserted.rows[0].id;
  }

  // GoTrue expects a matching identity row; without it the account exists but
  // password sign-in and account linking behave oddly.
  // `auth.identities.email` is a generated column derived from identity_data,
  // so it must not be written directly.
  await client.query(
    `insert into auth.identities (user_id, provider, provider_id, identity_data,
                                  last_sign_in_at, created_at, updated_at)
     values ($1::uuid, 'email', $2::text, $3::jsonb, now(), now(), now())
     on conflict (provider, provider_id) do nothing`,
    [userId, userId, JSON.stringify({ sub: userId, email, email_verified: true })],
  );

  const profile = await client.query('select count(*)::int as n from public.profiles where id = $1', [userId]);
  if (profile.rows[0].n === 0) {
    throw new Error('No profile row was created — the signup trigger did not fire. Refusing to commit.');
  }

  // Catch the NULL-token trap before committing rather than discovering it as a
  // failed sign-in later, when the cause is no longer obvious.
  const nulls = await client.query(
    `select confirmation_token is null as a, recovery_token is null as b,
            email_change_token_new is null as c, email_change is null as d
       from auth.users where id = $1`,
    [userId],
  );
  if (Object.values(nulls.rows[0]).some(Boolean)) {
    throw new Error('Token columns are still NULL — sign-in would fail. Refusing to commit.');
  }

  const admins = await client.query(`select count(*)::int as n from public.user_roles where role = 'admin'`);

  await client.query('commit');

  console.log(`\nAccount ${action}.\n`);
  console.log(`  Email     ${email}`);
  console.log(`  Password  ${password}`);
  console.log(`  Confirmed yes — no email needed\n`);
  console.log('Next: sign in at /login, then go to /setup to claim the organiser seat.');
  if (admins.rows[0].n > 0) {
    console.log(`Note: an admin already exists, so /setup will not offer the claim.`);
  }
  console.log('Change this password once email delivery works.\n');
} catch (error) {
  await client.query('rollback');
  console.error('\nRolled back, nothing changed:', error.message, '\n');
  process.exitCode = 1;
} finally {
  await client.end();
}
