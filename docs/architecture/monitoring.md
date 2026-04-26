# Monitoring Architecture

## Responsibility Split

```text
application emits signals
monitoring collects and validates signals
```

Backend 내부의 observability 코드는 signal을 만들고, `monitoring/` stack은 signal을 수집하고 검증합니다.

## Backend Signal Surface

- `GET /metrics`: Prometheus text format
- structured JSON logs: request, domain event, system event
- request context: `x-request-id`, buyer identity, trace id
- OpenTelemetry trace export to Tempo
- QA fault injection: local/demo stack에서만 활성화

## Monitoring Stack

- Prometheus: RED/USE, business funnel counters, recording/alert rules
- Loki: structured log query and trace/request correlation
- Tempo: request trace lookup
- Promtail: backend/demo log ingestion
- Grafana: dashboard, alerting, drilldown surface

## Dashboard Routing

운영자가 보는 순서는 다음을 기본값으로 둡니다.

```text
Landing -> SRE -> Infra -> Developer -> Executive
```

- Landing: 전체 상태와 다음 진입점 선택
- SRE: 사용자 체감 품질, 5xx, latency, availability
- Infra: host/container/DB saturation
- Developer: endpoint, trace, log, error signature
- Executive: business funnel and impact

자세한 패널 정의는 `docs/operations/dashboards.md`를 봅니다.
