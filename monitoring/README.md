# Monitoring stack run guide

## Beginner quick start

- First dashboard route: `Landing -> SRE -> Infra -> Developer -> Executive`
- Beginner guide is now in this README: `Grafana 초심자 가이드` section below.

## Grafana 초심자 가이드

### 1) 이 섹션으로 하는 일

- 처음 보는 사람이 5분 안에 모니터링 화면의 구조를 이해하고, 어디부터 봐야 하는지 판단하게 돕습니다.
- 실행 방법은 아래 `Run commands` 섹션을 먼저 참고하세요.

### 2) 용어 미니 사전

- Prometheus: 수치형 메트릭(CPU, 5xx, 지연 시간)을 수집하고 조회합니다.
- Loki: 로그를 수집하고 검색합니다.
- Tempo: 트레이스를 저장하고 요청 경로를 추적합니다.
- Promtail: 로그 파일/컨테이너 로그를 읽어 Loki로 전송합니다.
- OTLP: 애플리케이션이 트레이스를 Tempo로 보내는 표준 전송 형식입니다.

### 3) 아키텍처 읽는 법

범례
- `->` 호출: 서비스 간 요청/호출 흐름
- `=>` 수집: 텔레메트리(메트릭/로그/트레이스) 전송
- `~>` 조회: Grafana에서 데이터소스를 조회

읽기 순서
1. 앱(`mwa-demo`, `mwa-backend`)이 요청을 처리합니다.
2. 텔레메트리가 Prometheus/Loki/Tempo로 수집됩니다.
3. Grafana가 각 저장소를 조회해 대시보드에 표시합니다.

```text
[사용자 브라우저]
  -> Grafana(3000), Backend(8080), Demo(8081)

+----------------------------------------------------------------------------------+
| Docker Network: loki                                                             |
|                                                                                  |
| [mwa-demo] -> [mwa-backend] -> [postgres]                                        |
|     앱 시나리오        API 처리/비즈니스 로직     주문/결제 데이터 저장            |
|                                                                                  |
| [mwa-backend] => [prometheus]    메트릭 수집(요청 수, 5xx, 지연)                  |
| [mwa-backend] => [tempo]         트레이스 수집(요청 경로 추적)                    |
| [backend/demo logs] => [promtail] => [loki]  로그 수집/검색                       |
|                                                                                  |
| [postgres-exporter] => [prometheus]   DB 상태 메트릭                              |
| [cadvisor/node-exporter] => [prometheus]  컨테이너/호스트 리소스 메트릭           |
|                                                                                  |
| [grafana] ~> [prometheus]  PromQL 조회                                            |
| [grafana] ~> [loki]        LogQL 조회                                             |
| [grafana] ~> [tempo]       Trace 조회                                             |
+----------------------------------------------------------------------------------+
```

### 4) 대시보드 읽기 순서

1. `MWA / Landing`: 전체 네비게이션과 상태 요약 확인
2. `MWA / SRE`: 5xx, 지연, 가용성 등 서비스 품질 확인
3. `MWA / Infra`: CPU/메모리/DB/컨테이너 포화 상태 확인
4. `MWA / Developer`: Trace/Log 기반 원인 추적
5. `MWA / Executive`: 비즈니스 영향(검색/주문/결제) 확인

### 4-1) 레이어별 설명

- `Landing`: 첫 진입 레이어입니다. 전체 상태를 1분 안에 스캔하고 다음 분석 레이어를 선택합니다.
- `SRE`: 사용자 체감 품질 레이어입니다. 가용성, 5xx, 지연 기준으로 장애/성능 저하를 먼저 판별합니다.
- `Infra`: 자원 포화 레이어입니다. 호스트/컨테이너/DB 리소스 병목 여부를 확인합니다.
- `Developer`: 원인 추적 레이어입니다. Trace와 로그를 통해 문제 요청의 코드 경로와 오류 문맥을 확인합니다.
- `Executive`: 비즈니스 영향 레이어입니다. 검색/장바구니/주문/결제 흐름에서 성과 저하가 실제로 발생하는지 확인합니다.

### 4-2) 각 레이어 핵심 패널(현재 구현)

- `Landing`: `User Experience Status`, `Business Impact Status`, `Infra Health Status`, `Active Alerts`
- `SRE`: `Service Availability`, `5xx Ratio (5m)`, `Latency p95 (5m)`, `Apdex Score`, `Saturation Warning Summary`
- `Infra`: `Host/Container Usage`, `Container CPU Throttling`, `OOM / Restart Reason`, `DB Connections Used %`
- `Developer`: `Top 5 Slow API`, `Failed Request Table`, `Trace-selected Logs`, `Top Error Signatures`
- `Executive`: `Search/Cart/Order/Payment`, `Conversion Delta vs Baseline`, `Estimated Revenue Loss`

주의:
- `Worker Queue Lag`, `Thread/Pool Saturation`, `Estimated Revenue Loss`는 패널이 제공되지만 현재는 `TODO(미계측)` 상태입니다.
- `Recent Failed Traces` 자동 리스트는 Tempo 검색 API 연동 전까지 Explore 링크 중심으로 사용합니다.

### 5) 상황별 어디를 볼지

- 에러가 늘었다: `SRE -> Developer`
- 응답이 느리다: `SRE -> Infra -> Developer`
- DB가 의심된다: `Infra -> Developer`
- 비즈니스 영향 확인: `Executive`
- 전체 지표/노스스타 확인: `MWA 백엔드 개요`

### 6) 자주 막히는 지점(FAQ)

- Grafana는 열리는데 데이터가 비어 있음: 스택이 모두 기동됐는지(`docker compose ps`) 먼저 확인합니다.
- Trace가 비어 있음: `mwa-backend`의 OTLP endpoint가 Tempo로 설정됐는지 확인합니다.
- 로그가 없음: `promtail` 컨테이너와 `./data/backend-logs` 마운트 상태를 확인합니다.

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

## Postgres `pg_stat_statements` note

This stack enables `pg_stat_statements` by default for new Postgres volumes.

If you are reusing an existing `postgres_data` volume created before this change, run once:

```bash
docker compose -f monitoring/docker-compose.yml exec -T postgres \
  psql -U mwa -d mwa -c 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements;'
```
