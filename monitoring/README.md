# Monitoring Stack

This directory contains the local observability stack and demo/QA host.

## Quick Start

```bash
./monitoring/compose-env.sh up -d --build
```

Ubuntu override:

```bash
MONITORING_ENV=ubuntu ./monitoring/compose-env.sh up -d --build
```

Stop:

```bash
./monitoring/compose-env.sh down
```

## Main URLs

- Grafana: `http://127.0.0.1:3000`
- Backend: `http://127.0.0.1:8080`
- Demo/QA web: `http://127.0.0.1:8081/qa/scenarios`
- Alertmanager: `http://127.0.0.1:9093`
- Mailpit: `http://127.0.0.1:8025`

## AIOps Email Pipeline

The local stack wires Prometheus alerts to Alertmanager, then to the backend webhook:

```text
Prometheus -> Alertmanager -> /internal/alertmanager/webhook -> Email Notifier -> Mailpit
```

The compose default enables email delivery to Mailpit and keeps local LLM diagnosis disabled. Set `AIOPS_LLM_ENABLED=true` for the backend and run an OpenAI-compatible local model at `http://host.docker.internal:1234` to include LLM diagnosis; otherwise fallback reports still send.

## Documentation

- Monitoring architecture: `docs/architecture/monitoring.md`
- Local runbook: `docs/operations/local-runbook.md`
- Dashboard guide: `docs/operations/dashboards.md`
- Alert/SLI rules: `docs/operations/alerts.md`
- Telemetry contract: `docs/contracts/telemetry.md`
- Scenario runner contract: `docs/contracts/scenario-runner.md`

## Scenario Runner

```bash
npm run monitoring:scenario:list
npm run monitoring:scenario:k6:smoke
npm run monitoring:scenario:k6 -- --pack all
npm run monitoring:scenario:chaos -- --scenario service-down
npm run monitoring:scenario:recover
```

Full k6 packs and chaos scenarios are manual lanes because they are longer-running and may mutate seeded state.
