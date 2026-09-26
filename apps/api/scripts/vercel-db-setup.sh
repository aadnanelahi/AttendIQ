#!/bin/sh
# Runs during the Vercel build: syncs the database schema and loads the demo data.
# Uses the direct (unpooled) connection for schema changes when one is provided
# (Neon on Vercel sets DATABASE_URL_UNPOOLED).
set -e
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set - connect a Postgres database to this Vercel project." >&2
  exit 1
fi
DIRECT_URL="${DATABASE_URL_UNPOOLED:-${POSTGRES_URL_NON_POOLING:-$DATABASE_URL}}"
cd ../../packages/db
DATABASE_URL="$DIRECT_URL" pnpm exec prisma db push --skip-generate
DATABASE_URL="$DIRECT_URL" pnpm run seed
