#!/bin/sh
set -e
mkdir -p /app/logs
chown -R node:node /app/logs

if [ -n "$DATABASE_URL" ] && [ "$SKIP_DEMO_DB_MIGRATIONS" != "true" ]; then
  npx prisma migrate deploy
fi

if [ "$QA_CHAOS_ENABLED" = "true" ]; then
  exec node server.js
fi

exec su-exec node node server.js
