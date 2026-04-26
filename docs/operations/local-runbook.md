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

## Grafana

- URL: `http://127.0.0.1:3000`
- Dashboard order: `Landing -> SRE -> Infra -> Developer -> Executive`
