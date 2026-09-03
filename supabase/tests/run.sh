#!/usr/bin/env bash
# Replays the audited RLS attacks against a disposable Postgres as a NON-superuser.
#
# Why this exists: `postgres` bypasses RLS entirely, so unit tests, e2e tests and
# schema diffs can all pass while the policies are badly broken. Four CRITICAL
# tournament-day blockers hid behind exactly that gap. These tests run as the
# `anon` and `authenticated` roles, which is the only way the policies are real.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CT=ss-rls-test
PORT=${PORT:-55450}

cleanup() { docker rm -f "$CT" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$CT" -e POSTGRES_PASSWORD=postgres -p "$PORT":5432 postgres:16 >/dev/null
until docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 2

psql() { docker exec -i "$CT" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c "set client_min_messages = warning;" -f - "$@"; }

psql < "$DIR/00_supabase_stub.sql"
for f in "$DIR"/../migrations/*.sql; do psql < "$f"; done

# Supabase grants the API roles broadly and relies on RLS for protection.
# Reproduce that, or every test passes for the wrong reason (permission denied).
psql <<'EOF'
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;
EOF

psql < "$DIR/01_fixture.sql"
psql < "$DIR/02_harness.sql"

out=$(docker exec -i "$CT" psql -U postgres -d postgres -q < "$DIR/03_rls_attacks.sql" 2>&1
      docker exec -i "$CT" psql -U postgres -d postgres -q < "$DIR/04_rls_public.sql" 2>&1
      docker exec -i "$CT" psql -U postgres -d postgres -q < "$DIR/05_rls_golive.sql" 2>&1
      docker exec -i "$CT" psql -U postgres -d postgres -q < "$DIR/06_rls_roles.sql" 2>&1
      docker exec -i "$CT" psql -U postgres -d postgres -q < "$DIR/07_rls_payments.sql" 2>&1
      docker exec -i "$CT" psql -U postgres -d postgres -q < "$DIR/08_rls_waitlist.sql" 2>&1)
echo "$out" | grep -vE '^\s*$' | sed 's/^NOTICE:  //'

if echo "$out" | grep -q 'FAIL'; then
  echo; echo "RLS attack suite FAILED"; exit 1
fi
echo; echo "RLS attack suite passed ($(echo "$out" | grep -c 'PASS') checks)"
