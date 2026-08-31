#!/usr/bin/env bash
#
# The last mile: hand this script the Supabase API key and it wires the
# deployed site to the database.
#
# Everything else was done ahead of time — the migrations are applied and
# NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SITE_URL are already in Vercel. The
# API key is the one value that cannot be read out of the database or derived
# from anything else, so it has to be pasted in by a human exactly once.
#
# Usage:
#   ./scripts/finish-go-live.sh sb_publishable_xxxxxxxxxxxx
#   ./scripts/finish-go-live.sh eyJhbGciOi...        # legacy anon JWT
#
# Safe to re-run: it replaces the existing value rather than erroring.
set -euo pipefail

KEY="${1:-}"
if [ -z "$KEY" ]; then
  cat >&2 <<'USAGE'
Usage: ./scripts/finish-go-live.sh <supabase-api-key>

Find it in the Supabase dashboard under Project Settings > API Keys.
Use the PUBLISHABLE key (sb_publishable_...) or, on older projects, the
legacy anon public key (a long eyJ... JWT).

Do NOT use the secret / service_role key. It bypasses row-level security
entirely, and this app never needs it.
USAGE
  exit 1
fi

# Refusing the wrong key is worth the ten lines. Pasting a service-role key
# into a NEXT_PUBLIC_* variable ships it to every browser that loads the site
# and hands every visitor full read/write on the tournament.
case "$KEY" in
  sb_secret_*|*service_role*)
    echo "Refusing: that looks like a SECRET/service-role key." >&2
    echo "It would be exposed to every visitor. Use the publishable/anon key." >&2
    exit 1 ;;
esac

# Check the key actually belongs to THIS project before deploying it.
#
# Supabase keys all look alike, and a key from a different project fails with a
# 401 that surfaces as "the site is still in demo mode" — indistinguishable
# from having set nothing at all. This exact mistake has already happened once
# here. One HTTP call rules it out.
TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"' EXIT
PROJECT_URL=""
# `|| true` throughout: a failure to read the URL must not abort the script
# under `set -e`, it just means we skip the check.
if npx --yes vercel@latest env pull "$TMP_ENV" --environment=production --yes >/dev/null 2>&1; then
  PROJECT_URL="$(sed -n 's/^NEXT_PUBLIC_SUPABASE_URL="\(.*\)"$/\1/p' "$TMP_ENV" | head -1 || true)"
fi

if [ -n "$PROJECT_URL" ]; then
  echo "Checking the key against $PROJECT_URL ..."
  STATUS="$(curl -s -o /dev/null -w '%{http_code}' "$PROJECT_URL/rest/v1/" -H "apikey: $KEY")"
  if [ "$STATUS" = "401" ] || [ "$STATUS" = "403" ]; then
    echo >&2
    echo "Refusing: $PROJECT_URL rejected that key (HTTP $STATUS)." >&2
    echo "It is most likely from a different Supabase project. Copy it from" >&2
    echo "the dashboard for this project: Project Settings > API Keys." >&2
    exit 1
  fi
  echo "Key accepted by the project (HTTP $STATUS)."
else
  echo "Warning: could not read NEXT_PUBLIC_SUPABASE_URL from Vercel, so the" >&2
  echo "key could not be checked. Continuing." >&2
fi

VAR=NEXT_PUBLIC_SUPABASE_ANON_KEY
# Production and Development only. Preview is left unset on purpose so pull
# request previews stay in demo mode and cannot write to the real tournament.
for ENVIRONMENT in production development; do
  echo "Setting $VAR for $ENVIRONMENT ..."
  npx --yes vercel@latest env rm "$VAR" "$ENVIRONMENT" --yes >/dev/null 2>&1 || true
  printf '%s' "$KEY" | npx --yes vercel@latest env add "$VAR" "$ENVIRONMENT" >/dev/null
done

echo
echo "Redeploying production (env vars are read at build time) ..."
npx --yes vercel@latest --prod

cat <<'NEXT'

Done. Two things are still yours to do, in this order:

  1. Supabase dashboard > Authentication > URL Configuration
       Site URL:      https://sunday-smashers.vercel.app
       Redirect URLs: https://sunday-smashers.vercel.app/auth/callback
                      http://localhost:3000/auth/callback
     Skip this and every confirmation email points at localhost.

  2. Visit https://sunday-smashers.vercel.app/setup
     Claim the first organiser account, then create the tournament.

Confirm the amber "demo data" banner is gone before telling anyone the URL.
See docs/GO-LIVE.md for the full runbook.
NEXT
