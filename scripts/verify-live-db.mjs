#!/usr/bin/env node
/**
 * Replays the RLS attack suite against a REAL Supabase project, then rolls
 * back so the database is left exactly as it was found.
 *
 * `supabase/tests/run.sh` proves the *migrations* are safe by replaying them
 * into a disposable Docker container. That is the right test for the source
 * tree, but it cannot catch a deployment that drifted: a migration applied
 * out of order, a policy someone edited in the dashboard, a grant the
 * platform added back. This script closes that gap by running the identical
 * attacks against the database players will actually use.
 *
 * It connects as `postgres` but every check runs after `set local role
 * anon|authenticated`, because `postgres` bypasses row-level security
 * entirely — the whole suite would pass for the wrong reason otherwise.
 *
 * Everything happens inside one transaction that always ends in ROLLBACK,
 * including the fixture rows and the temporary harness function.
 *
 * Usage:
 *   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres' \
 *     node scripts/verify-live-db.mjs
 *
 * Use the SESSION pooler (port 5432), not the transaction pooler (6543):
 * the suite needs `set local role` to survive across statements.
 */
import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TESTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'tests')

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('SUPABASE_DB_URL is not set. See the header of this file.')
  process.exit(2)
}

/**
 * The attack files are written for `psql`, which supports meta-commands this
 * driver does not. Drop the display settings and expand `\set` variables by
 * hand rather than maintaining a second copy of the tests.
 */
function stripPsqlMeta(sql) {
  const vars = {}
  const lines = []
  for (const line of sql.split('\n')) {
    const declaration = line.match(/^\\set\s+(\w+)\s+'(.*)'\s*$/)
    if (declaration) {
      vars[declaration[1]] = declaration[2].replace(/''/g, "'")
      continue
    }
    if (line.startsWith('\\')) continue
    lines.push(line)
  }
  let out = lines.join('\n')
  for (const [name, value] of Object.entries(vars)) out = out.replaceAll(`:${name}`, value)
  return out
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

/** Checks report through both result rows and NOTICEs; collect both. */
const notices = []
client.on('notice', (n) => notices.push(n.message))

const read = (file) => fs.readFileSync(path.join(TESTS, file), 'utf8')

let passed = 0
const failures = []
let fatal = null

await client.connect()
await client.query('set statement_timeout = 0')
await client.query('begin')
try {
  for (const file of ['01_fixture.sql', '02_harness.sql']) await client.query(read(file))
  for (const file of ['03_rls_attacks.sql', '04_rls_public.sql', '05_rls_golive.sql']) {
    const result = await client.query(stripPsqlMeta(read(file)))
    for (const set of Array.isArray(result) ? result : [result]) {
      for (const row of set.rows ?? []) {
        const value = Object.values(row)[0]
        if (typeof value !== 'string') continue
        if (value.includes('FAIL')) failures.push(value)
        else if (value.includes('PASS')) passed += 1
        else if (value.startsWith('---')) console.log(value)
      }
    }
  }
} catch (error) {
  fatal = error.message
} finally {
  // Always. A half-applied fixture in the real tournament database would be
  // far worse than a failed test run.
  await client.query('rollback')
  await client.end()
}

for (const message of notices) {
  if (message.includes('FAIL')) failures.push(message)
  else if (message.includes('PASS')) passed += 1
}

for (const failure of failures) console.log(failure)
console.log(`\n${passed} passed, ${failures.length} failed — transaction rolled back`)
if (fatal) console.error(`ERROR: ${fatal}`)
process.exit(failures.length > 0 || fatal ? 1 : 0)
