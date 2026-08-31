#!/usr/bin/env node
/**
 * Rehearses the very first minutes of the live site, against the real
 * database, without leaving a trace.
 *
 * The bootstrap path is the one path nobody can practise. `claim_first_admin`
 * is inert forever after its first success, so the committee gets exactly one
 * attempt at it on the real project — and if it fails, or worse, if it hands
 * admin to the wrong person, there is no undo. Unit tests cover the function's
 * logic but not the deployed grants, triggers and RLS policies it depends on.
 *
 * So this replays the whole sequence — two signups, the claim, the door
 * closing behind it, and an admin creating the tournament — inside a single
 * transaction that always ends in ROLLBACK.
 *
 * It connects as `postgres` but performs every check after `set local role`,
 * because `postgres` bypasses row-level security: the negative checks would
 * all pass for the wrong reason otherwise.
 *
 * Usage:
 *   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres' \
 *     node scripts/rehearse-first-run.mjs
 *
 * Use the SESSION pooler (port 5432), not the transaction pooler (6543):
 * `set local role` must survive across statements.
 */
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL is not set. See the header of this file.');
  process.exit(2);
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// Become a signed-in user the way PostgREST does: role + JWT claims.
async function as(role, uid) {
  await client.query(`set local role ${role}`);
  const claims = uid ? JSON.stringify({ sub: uid, role }) : '{}';
  await client.query(`select set_config('request.jwt.claims', $1::text, true)`, [claims]);
}
async function asSuper() {
  await client.query('reset role');
  await client.query(`select set_config('request.jwt.claims', '', true)`);
}

async function expectFail(label, fn) {
  try {
    await fn();
    record(label, false, 'it was ALLOWED — expected a refusal');
  } catch (e) {
    record(label, true, e.message.split('\n')[0].slice(0, 90));
  }
  await client.query('rollback to savepoint sp');
}

await client.connect();
await client.query('begin');

try {
  const u1 = (await client.query('select gen_random_uuid() as id')).rows[0].id;
  const u2 = (await client.query('select gen_random_uuid() as id')).rows[0].id;

  // Simulate two signups exactly as Supabase Auth does.
  for (const [id, email] of [[u1, 'rehearsal-one@example.test'], [u2, 'rehearsal-two@example.test']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                               email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                               created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               $2, crypt('rehearsal-pw', gen_salt('bf')), now(), '{"provider":"email"}',
               $3::jsonb, now(), now())`,
      [id, email, JSON.stringify({ full_name: 'Rehearsal Player' })],
    );
  }

  const prof = await client.query('select count(*)::int as n from public.profiles where id = any($1)', [[u1, u2]]);
  record('signup trigger creates a profile for each new user', prof.rows[0].n === 2, `${prof.rows[0].n}/2 profiles`);

  await client.query('savepoint sp');

  // --- anon must not be able to bootstrap itself ---
  await expectFail('anon cannot call claim_first_admin', async () => {
    await as('anon', null);
    await client.query('select public.claim_first_admin()');
  });

  await asSuper();
  await client.query('savepoint sp');
  await expectFail('anon cannot create a tournament', async () => {
    await as('anon', null);
    await client.query(
      `insert into public.tournaments (name, slug, tournament_date, registration_opens_at)
       values ('Hijack','hijack', current_date, now())`,
    );
  });

  // --- the real bootstrap path ---
  await asSuper();
  await as('authenticated', u1);
  const claimed = await client.query('select public.claim_first_admin() as r');
  record('first signed-in user can claim admin', claimed.rows[0].r === 'granted', claimed.rows[0].r);

  await asSuper();
  const isAdmin = await client.query(
    `select count(*)::int as n from public.user_roles where user_id = $1 and role = 'admin'`, [u1]);
  record('claim writes an admin role row', isAdmin.rows[0].n === 1);

  // --- the door must close behind them ---
  await client.query('savepoint sp');
  await expectFail('a second user cannot claim admin once one exists', async () => {
    await as('authenticated', u2);
    await client.query('select public.claim_first_admin()');
  });

  // --- the new admin can actually run the tournament ---
  await asSuper();
  await as('authenticated', u1);
  const t = await client.query(
    `insert into public.tournaments (name, slug, tournament_date, registration_opens_at)
     values ('Rehearsal Cup','rehearsal-cup', current_date, now()) returning id`,
  );
  record('the new admin can create the tournament', t.rows.length === 1);

  await asSuper();
  await client.query('savepoint sp');
  await expectFail('a plain player cannot create a tournament', async () => {
    await as('authenticated', u2);
    await client.query(
      `insert into public.tournaments (name, slug, tournament_date, registration_opens_at)
       values ('Nope','nope', current_date, now())`,
    );
  });

  await asSuper();
} finally {
  await client.query('rollback');
  const left = await client.query(
    `select (select count(*) from auth.users)::int as users,
            (select count(*) from public.tournaments)::int as tournaments,
            (select count(*) from public.user_roles)::int as roles`,
  );
  console.log('\nafter rollback:', left.rows[0]);
  await client.end();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
