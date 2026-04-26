# Monitoring Scenario Runner

CLI-first runner for monitoring validation scenarios. This module is separate
from the QA Web UI and calls the backend, Docker, Prometheus, Loki, and Tempo
directly.

## Commands

Run from the repository root:

```bash
npm run monitoring:scenario:list
npm run monitoring:scenario:k6:smoke
npm run monitoring:scenario:k6 -- --pack buyer
npm run monitoring:scenario:k6 -- --scenario fault-search-delay
npm run monitoring:scenario:chaos -- --scenario service-down
npm run monitoring:scenario:recover
```

## k6 Scenarios

k6 scenarios call backend HTTP APIs directly. They use:

- `BASE_URL` default `http://127.0.0.1:8080`
- selection precedence: `--scenario` > `SCENARIO_IDS` > `--pack` > `SCENARIO_PACK` > `smoke`
- packs: `smoke`, `contract`, `buyer`, `fault`, `validation`, `all`
- `DURATION` default `5m`
- `VUS` default `4`
- `RESET_SEED` default `true`
- `SLEEP_SECONDS` default `1`
- `SUMMARY_EXPORT` default `monitoring/scenario-runner/results/summary.json`

Example:

```bash
npm run monitoring:scenario:k6:smoke
BASE_URL=http://127.0.0.1:8080 DURATION=1m VUS=2 npm run monitoring:scenario:k6 -- --pack all
BASE_URL=http://127.0.0.1:8080 npm run monitoring:scenario:k6 -- --scenario fault-search-delay,buyer-payment-failure
```

The k6 catalog is the source of truth for routine scenario testing. The QA Web
reads this catalog and latest k6 summary as a companion UI; legacy web-defined
checks remain available only for compatibility.

## Chaos Scenarios

Chaos scenarios are Node CLI tasks because k6 cannot safely perform Docker,
network, disk, or telemetry-store operations. They use:

- `PROMETHEUS_BASE_URL` default `http://127.0.0.1:9090`
- `LOKI_BASE_URL` default `http://127.0.0.1:3100`
- `TEMPO_BASE_URL` default `http://127.0.0.1:3200`
- Docker containers named `mwa-backend`, `mwa-postgres`, `mwa-promtail`, and `mwa-tempo`

Destructive scenarios are intended only for the local chaos compose stack:

```bash
docker compose -f monitoring/docker-compose.yml -f monitoring/docker-compose.chaos.yml up -d --build
```

Run recovery after interrupted chaos work:

```bash
npm run monitoring:scenario:recover
```
