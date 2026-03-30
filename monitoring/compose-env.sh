#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
environment="${MONITORING_ENV:-desktop}"
compose_args=("-f" "$script_dir/docker-compose.yml")

case "$environment" in
  desktop)
    ;;
  ubuntu)
    compose_args+=("-f" "$script_dir/docker-compose.ubuntu.yml")
    ;;
  *)
    echo "Unsupported MONITORING_ENV: $environment" >&2
    echo "Supported values: desktop, ubuntu" >&2
    exit 1
    ;;
esac

exec docker compose "${compose_args[@]}" "$@"
