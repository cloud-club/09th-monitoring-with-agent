# 09th-monitoring-with-agent

관측 가능한 이커머스 데모 백엔드와 로컬 모니터링 스택입니다. 코드는 세 축으로 나눠 봅니다.

- Application: `apps/backend`의 NestJS API, 도메인 유스케이스, DB read/write 모델
- Monitoring: `monitoring`의 Prometheus/Grafana/Loki/Tempo, fault injection, k6/chaos scenario
- Testing: backend unit/integration/e2e/live 테스트와 monitoring scenario smoke gate

## Documentation Map

- 전체 문서 입구: `docs/README.md`
- 구조: `docs/architecture/overview.md`
- 애플리케이션 구조: `docs/architecture/application.md`
- 모니터링 구조: `docs/architecture/monitoring.md`
- 테스트 전략: `docs/architecture/testing.md`
- HTTP API 계약: `docs/contracts/http-api.md`
- 텔레메트리 계약: `docs/contracts/telemetry.md`
- 로컬 운영 가이드: `docs/operations/local-runbook.md`

## Quick Start

Backend only:

```bash
cd apps/backend
npm install
npm run dev
```

Monitoring stack:

```bash
./monitoring/compose-env.sh up -d --build
```

Scenario smoke:

```bash
npm run monitoring:scenario:k6:smoke
```

## Important Entrypoints

- Backend: `http://127.0.0.1:8080`
- Health: `GET /health`
- Metrics: `GET /metrics`
- Demo/QA web: `http://127.0.0.1:8081/qa/scenarios`
- Grafana: `http://127.0.0.1:3000`
