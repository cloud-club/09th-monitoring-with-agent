#!/bin/sh
set -e
mkdir -p /app/logs
chown -R node:node /app/logs

if [ -n "$DATABASE_URL" ]; then
  npx prisma migrate deploy
fi

exec su-exec node node server.js
