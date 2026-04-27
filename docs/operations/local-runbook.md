# Local Runbook

## Backend Only

```bash
cd apps/backend
npm install
npm run dev
```

Health check:

```bash
curl http://127.0.0.1:8080/health
```

## Monitoring Stack

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

## Chaos Stack

Use only on a dedicated local/demo stack.

```bash
docker compose -f monitoring/docker-compose.yml -f monitoring/docker-compose.chaos.yml up -d --build
```

Recover:

```bash
npm run monitoring:scenario:recover
```

## Scenario Runner

```bash
npm run monitoring:scenario:list
npm run monitoring:scenario:k6:smoke
npm run monitoring:scenario:k6 -- --pack all
npm run monitoring:scenario:chaos -- --scenario service-down
```

## Email Notifier

Email delivery is disabled by default.

For local diagnosis enrichment, run an OpenAI-compatible local LLM server at:

```text
http://127.0.0.1:1234
```

Default model id:

```text
qwen/qwen3.6-27b
```

Enable local LLM enrichment:

```bash
AIOPS_LLM_ENABLED=true
AIOPS_LLM_BASE_URL=http://127.0.0.1:1234
AIOPS_LLM_MODEL=qwen/qwen3.6-27b
AIOPS_EVIDENCE_COLLECTION_ENABLED=true
PROMETHEUS_BASE_URL=http://127.0.0.1:9090
LOKI_BASE_URL=http://127.0.0.1:3100
TEMPO_BASE_URL=http://127.0.0.1:3200
```

Enable SMTP only when a local test mailbox or real SMTP server is configured:

```bash
EMAIL_NOTIFIER_ENABLED=true
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM="MWA AIOps <alerts@example.local>"
EMAIL_DEFAULT_RECIPIENTS=sre@example.local
EMAIL_PAYMENT_RECIPIENTS=payment-team@example.local,sre@example.local
EMAIL_CHECKOUT_RECIPIENTS=backend-team@example.local,sre@example.local
EMAIL_INFRA_RECIPIENTS=platform-team@example.local,sre@example.local
```

See `docs/contracts/email-notifier.md` for the service contract, fallback behavior, and metrics.

## Grafana

- URL: `http://127.0.0.1:3000`
- Dashboard order: `Landing -> SRE -> Infra -> Developer -> Executive`
