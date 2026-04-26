# Architecture Overview

이 프로젝트는 일반적인 백엔드 앱 하나가 아니라, 관측 가능한 데모 시스템입니다. 그래서 구조를 세 축으로 나눠 봅니다.

```text
application
  실제 API, 도메인 흐름, 데이터 읽기/쓰기

monitoring
  애플리케이션이 내보내는 metrics/logs/traces 수집과 시나리오 검증

testing
  코드 변경과 운영 신호가 기대한 public behavior를 유지하는지 검증
```

## Application

`apps/backend/src`의 NestJS 앱입니다. feature module은 `catalog`, `search`, `recommendation`, `cart`, `order`, `payment`로 나뉩니다.

- Controller: HTTP request/response boundary
- Service: use case flow, transaction orchestration, domain rule
- Repository/read model: raw SQL, DB row loading, persistence
- Mapper: DB row to API/domain view

## Monitoring

`monitoring`과 backend의 observability module이 함께 구성합니다.

- Backend emits: `/metrics`, structured logs, trace headers/spans
- Stack collects: Prometheus, Loki, Tempo, Promtail
- Grafana reads: Landing, SRE, Infra, Developer, Executive dashboards
- Scenario runner validates: k6 packs and chaos scenarios

## Testing

테스트는 목적별로 분리합니다.

- Unit: pure parser, mapper, policy
- Integration: Nest app + DB + public API behavior
- E2E: running backend process 기준 full flow
- Monitoring scenario: k6, chaos, Prometheus/Loki/Tempo 검증
- Live: 외부/수동 환경 대상
