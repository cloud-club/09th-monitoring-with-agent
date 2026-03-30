# Monitoring stack run guide

## Environment-specific compose support

This directory now supports environment-specific compose execution:

- `docker-compose.yml` (default/Desktop)
- `docker-compose.ubuntu.yml` (Ubuntu + Docker Engine override)

## Run commands

From any current directory:

```bash
export USER_ID=$(id -u)
/path/to/repo/monitoring/compose-env.sh up -d --build
```

Select Ubuntu explicitly:

```bash
export USER_ID=$(id -u)
MONITORING_ENV=ubuntu /path/to/repo/monitoring/compose-env.sh up -d --build
```

The helper always loads base compose first and applies Ubuntu overrides only when `MONITORING_ENV=ubuntu`.

Or run compose directly with explicit files:

```bash
export USER_ID=$(id -u)
docker compose -f monitoring/docker-compose.yml -f monitoring/docker-compose.ubuntu.yml up -d --build
```

## Stop stack

```bash
MONITORING_ENV=ubuntu /path/to/repo/monitoring/compose-env.sh down
/path/to/repo/monitoring/compose-env.sh down
```
