#!/bin/sh
set -e
mkdir -p /app/logs
chown -R node:node /app/logs
exec su-exec node node server.js
