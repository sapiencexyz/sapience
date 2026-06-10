#!/usr/bin/env bash
# Enforce that new Prisma migrations are wrapped in an explicit transaction
# (BEGIN; ... COMMIT;).
#
# `prisma migrate deploy` does NOT wrap migrations in a transaction: a
# migration failing halfway leaves the schema partially applied, which blocks
# further deploys and has no clean rollback. Postgres DDL is transactional,
# so wrapping is free — on failure the whole migration rolls back and the
# database stays consistent with the still-running old code.
#
# Scope: migrations newer than CUTOFF. Older ones predate this policy and are
# already applied — their files MUST NOT be edited (Prisma checksums applied
# migrations and `migrate deploy` fails on a mismatch).
#
# Opt-out: operations that cannot run inside a transaction (e.g. CREATE INDEX
# CONCURRENTLY) may add a `-- no-transaction` comment line. Keep such
# migrations to a SINGLE statement so a failure cannot leave partial state.
set -euo pipefail
shopt -s nullglob

MIGRATIONS_DIR="$(cd "$(dirname "$0")/../prisma/migrations" && pwd)"

# Last migration created before this policy: 20260529001202.
CUTOFF="20260530000000"

failed=0
checked=0
for sql in "$MIGRATIONS_DIR"/*/migration.sql; do
  dir="$(basename "$(dirname "$sql")")"
  ts="${dir%%_*}"
  [[ "$ts" < "$CUTOFF" ]] && continue

  if grep -qiE '^[[:space:]]*--[[:space:]]*no-transaction' "$sql"; then
    echo "SKIP  $dir (explicit -- no-transaction)"
    continue
  fi

  checked=$((checked + 1))
  if grep -qiE '^[[:space:]]*BEGIN[[:space:]]*;' "$sql" && grep -qiE '^[[:space:]]*COMMIT[[:space:]]*;' "$sql"; then
    echo "OK    $dir"
  else
    echo "FAIL  $dir — migration.sql is not wrapped in BEGIN;/COMMIT;"
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  cat >&2 <<'EOF'

Migrations must be transactional so a halfway failure cannot leave the schema
in a partial state. Fix: add `BEGIN;` as the first statement and `COMMIT;` as
the last statement of migration.sql. If the migration genuinely cannot run in
a transaction (CREATE INDEX CONCURRENTLY, ALTER TYPE ... ADD VALUE), add a
`-- no-transaction` comment line and keep it to a single statement.
EOF
  exit 1
fi

echo "All ${checked} post-cutoff migration(s) are transactional."
