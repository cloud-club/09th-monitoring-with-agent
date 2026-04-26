# 메트릭 대시보드 설계서

**대상 제품**: monitoring-with-agent 데모 프로젝트  
**제품 단계**: 프리런치 / 설계 단계  
**운영 스택**: `Grafana + Loki + Prometheus`  
**관측 대상 서비스 범위**: 검색, 상품 상세, 장바구니, 주문 생성, 모의 결제

## 1. 무엇을 측정하는가

- 1차 측정 대상은 `모니터링 데모 제품` 자체다.
- 2차 측정 대상은 데모가 관측하는 `내부 이커머스 퍼널`이다.
- 원칙은 `적은 수의 지표를 정확하게 계측`하는 것이다.

## 2. 지표 분류

| 구분 | 돈을 지키기 위한 모니터링 | 돈을 벌기 위한 모니터링 |
|---|---|---|
| 핵심 목적 | 손실 방지, 장애 탐지, 운영 안정성 확보 | 성장, 전환, 성과 최적화 |
| 주요 대상 | 장애, 성능, 오류, 자원 포화, 관측 누락 | 검색 성능, 장바구니 전환, 주문 성공, 결제 완료 |
| 대표 질문 | 서비스가 멈추지 않는가? 빨리 알 수 있는가? | 서비스가 실제로 성과를 만들고 있는가? |
| 활용 부서 | SRE, DevOps, Backend, Platform | Product, Growth, Business |
| 대표 지표 | CPU, 메모리, 5xx 오류율, p95 지연 시간 | 검색 성공률, 장바구니 전환율, 주문 성공률, 결제 완료율 |

## 3. 노스스타 메트릭

**노스스타**: 행동 가능한 인시던트 커버리지

**정의**: 핵심 퍼널 인시던트 중 5분 안에 아래 3가지를 모두 제공한 비율

1. 알림 발생
2. 메트릭/로그 드릴다운 경로 제공
3. 읽을 수 있는 요약 카드 생성

**공식**:

`5분 내 알림 + 근거 + 요약이 모두 준비된 인시던트 수 / 전체 핵심 인시던트 수`

**왜 이 지표인가**

- 모니터링 시스템이 실제로 전달하는 가치를 측정한다.
- 팀이 행동을 바꿀 수 있는 지표다.
- 단순 트래픽이나 호출 수 같은 허영 지표를 피한다.

**목표값**: 최종 데모 전 `>= 80%`

## 4. 입력 지표

| 지표 | 정의 | 오너 | 목표 | 현재 |
|---|---|---|---|---|
| 텔레메트리 완전성 | 핵심 엔드포인트 중 메트릭+로그+event_name이 모두 있는 비율 | 서비스 | `100%` | `TBD` |
| 알림 커버리지 | 핵심 시나리오 중 유효 알림이 있는 비율 | 모니터링 | `>= 80%` | `TBD` |
| 요약 생성 성공률 | 핵심 인시던트 중 요약 카드 생성 비율 | 분석 | `>= 90%` | `TBD` |
| 드릴다운 성공률 | 대시보드에서 로그/메트릭으로 한 번에 이동 가능한 비율 | 모니터링 | `>= 90%` | `TBD` |
| 시나리오 재현율 | 시드 장애를 수동 보정 없이 재현한 비율 | 서비스 | `>= 90%` | `TBD` |

## 5. 건강 지표

| 지표 | 정상 | 경고 | 심각 |
|---|---|---|---|
| API 5xx 오류율 | `< 1%` | `1~3%` | `> 3%` 5분 |
| API p95 지연 시간 | `< 700ms` | `700ms~1초` | `> 1초` 5분 |
| CPU 사용률 | `< 70%` | `70~80%` | `> 80%` 5분 |
| 메모리 사용률 | `< 75%` | `75~85%` | `> 85%` 5분 |
| 로그 수집 지연 | `< 30초` | `30~60초` | `> 60초` |
| 메트릭 스크랩 성공률 | `100%` | 일시 실패 | 반복 실패 |

## 6. 카운터 메트릭

| 지표 | 필요한 이유 | 주의할 점 |
|---|---|---|
| 오탐 알림 비율 | 커버리지만 높고 쓸모없는 알림 난사를 막기 위해 | 운영자가 실제 액션하지 않는 알림이 늘어나는지 확인 |
| 고카디널리티 증가 | 라벨 설계 실패를 막기 위해 | `*_id` 라벨, 로그 스트림 폭증 여부 확인 |

## 7. SLI

SLI는 “무엇을 측정할 것인가”를 정의한다.

| SLI ID | 영역 | SLI | 정의 | 로그 | 메트릭 | 트레이스 |
|---|---|---|---|---|---|---|
| SLI-01 | 돈을 지키기 | API 오류율 | 핵심 API의 5xx 비율 | `error_code`, `endpoint`, `request_id` | `http_requests_total`, `5xx ratio` | 1차 미수집, 추후 OTEL 연결 |
| SLI-02 | 돈을 지키기 | API p95 지연 시간 | 검색/장바구니/주문/결제 API의 p95 | 느린 요청 로그, `request_id` | `http_request_duration_seconds` | 1차 미수집 |
| SLI-03 | 돈을 지키기 | 서비스 가용성 | 핵심 서비스가 응답 가능한 상태인지 | 서비스 down 로그 | `up` | 1차 미수집 |
| SLI-04 | 돈을 지키기 | 로그 수집 지연 | 로그가 실시간에 가깝게 적재되는지 | 수집 지연 로그 | 수집 지연 카운터 또는 gauge | 1차 미수집 |
| SLI-05 | 돈을 벌기 | 검색 성공률 | 정상 검색 응답 비율 | search 실패 로그, query context | search success counter | 1차 미수집 |
| SLI-06 | 돈을 벌기 | 검색 결과 존재율 | zero-result가 아닌 검색 비율 | zero-result query 로그 | zero-result ratio | 1차 미수집 |
| SLI-07 | 돈을 벌기 | 장바구니 담기 성공률 | cart add 성공 비율 | cart validation 로그 | cart add success counter | 1차 미수집 |
| SLI-08 | 돈을 벌기 | 주문 생성 성공률 | order create 성공 비율 | order validation, save error 로그 | order create success ratio | 1차 미수집 |
| SLI-09 | 돈을 벌기 | 결제 완료율 | `payment.succeeded / payment.started` | payment result 로그, `payment_id` | payment success ratio | 1차 미수집 |
| SLI-10 | 모니터링 제품 | 행동 가능한 인시던트 커버리지 | 알림+드릴다운+요약이 5분 내 준비된 비율 | summary 생성 로그, scenario_id | alert coverage counter | 1차 미수집 |

## 8. SLO

SLO는 “어느 수준까지 유지할 것인가”를 정한다.

| SLO ID | 연결 SLI | 목표 | 측정 창 | 비고 |
|---|---|---|---|---|
| SLO-01 | SLI-01 API 오류율 | `5xx < 1%` | 30일 / 7일 / 1일 | 핵심 API 공통 |
| SLO-02 | SLI-02 API p95 | `95% 구간에서 1초 이하` | 7일 / 1일 | 저트래픽 시 절대건수 보조 |
| SLO-03 | SLI-03 서비스 가용성 | `>= 99.5%` | 30일 | 데모 기준 내부 목표 |
| SLO-04 | SLI-05 검색 성공률 | `>= 99.5%` | 7일 | |
| SLO-05 | SLI-07 장바구니 담기 성공률 | `>= 99.5%` | 7일 | |
| SLO-06 | SLI-08 주문 생성 성공률 | `>= 99.0%` | 7일 | 비즈니스 핵심 |
| SLO-07 | SLI-09 결제 완료율 | `>= 90%` | 7일 | 모의 결제 기준 |
| SLO-08 | SLI-10 행동 가능한 인시던트 커버리지 | `>= 80%` | 주간 리뷰 | 데모 가치 핵심 |

## 9. SLA

SLA는 외부 약속이지만, 현재 프로젝트는 외부 고객 계약형 서비스가 아니므로 `내부 참고용 SLA`만 둔다.

| SLA ID | 연결 SLO | 내부 참고 기준 | 대상 |
|---|---|---|---|
| SLA-01 | SLO-03 서비스 가용성 | `>= 99.0%` | 내부 데모 환경 |
| SLA-02 | SLO-06 주문 생성 성공률 | `>= 98.0%` | 데모 리뷰 세션 |
| SLA-03 | SLO-07 결제 완료율 | `>= 85%` | 모의 결제 단계 |

## 10. 대시보드 레이아웃

고정폭 박스 대신, 실제 구현과 리뷰에 바로 쓸 수 있도록 `영역별 패널 구조`로 정리한다.

| 영역 | 위치 | 포함 패널 | 목적 |
|---|---|---|---|
| 1. 노스스타 영역 | 최상단 전체 너비 | 행동 가능한 인시던트 커버리지, 목표값, 현재 상태, 설명 가능 시간 | 이 대시보드가 궁극적으로 잘 작동하는지 한눈에 확인 |
| 2. 입력 지표 영역 A | 2행 좌측 | 텔레메트리 완전성 | 핵심 엔드포인트 계측 누락 여부 확인 |
| 3. 입력 지표 영역 B | 2행 우측 | 알림 커버리지 | 핵심 시나리오에 알림이 연결되는지 확인 |
| 4. 입력 지표 영역 C | 3행 좌측 | 요약 성공률 | 에이전트 요약이 실제로 생성되는지 확인 |
| 5. 입력 지표 영역 D | 3행 우측 | 드릴다운 성공률 | 운영자가 로그/메트릭으로 바로 이동 가능한지 확인 |
| 6. 건강 지표 영역 | 4행 전체 너비 | 5xx 오류율, p95 지연 시간, CPU, 메모리, 로그 수집 지연 | 서비스 안정성과 관측 체계 상태 확인 |
| 7. 비즈니스 퍼널 영역 | 5행 전체 너비 | 검색 -> 상세 -> 장바구니 -> 주문 -> 결제 단계별 전환 | 돈을 버는 흐름이 어디서 깨지는지 확인 |
| 8. 인시던트 영역 | 6행 전체 너비 | 활성 알림, 장애 유형, 요약 카드, 드릴다운 링크 | 운영자가 실제 대응을 시작하는 작업 공간 |

### 배치 예시

```text
[노스스타: 행동 가능한 인시던트 커버리지 | 목표 | 현재 | 설명 가능 시간]

[입력: 텔레메트리 완전성]   [입력: 알림 커버리지]
[입력: 요약 성공률]         [입력: 드릴다운 성공률]

[건강 지표: 5xx | p95 | CPU | 메모리 | 로그 지연]

[비즈니스 퍼널: 검색 -> 상세 -> 장바구니 -> 주문 -> 결제]

[인시던트: 활성 알림 | 장애 유형 | 요약 카드 | 로그/메트릭 이동]
```

### 모바일 또는 좁은 화면 기준

- 상단 노스스타 영역은 단일 카드로 유지한다.
- 입력 지표 4개는 2x2 또는 세로 4단으로 접는다.
- 건강 지표와 퍼널은 각각 독립 섹션으로 유지한다.
- 인시던트 영역은 항상 마지막 섹션에 둬서 운영 흐름을 보존한다.

## 11. 메트릭별 임계치

| 지표 | 초록 | 노랑 | 빨강 | 점검 주기 |
|---|---|---|---|---|
| 행동 가능한 인시던트 커버리지 | `>= 80%` | `60~79%` | `< 60%` | 주간 |
| 설명 가능 시간 | `<= 5분` | `5~10분` | `> 10분` | 시나리오별 |
| API 5xx 오류율 | `< 1%` | `1~3%` | `> 3%` | 5분 |
| API p95 지연 시간 | `< 700ms` | `700ms~1초` | `> 1초` | 5분 |
| 결제 완료율 | `>= 95%` | `90~94%` | `< 90%` | 5분 |
| 검색 결과 존재율 | 안정 | 기준선 초과 하락 | 급격한 하락 | 시간별 |
| 오탐 알림 비율 | 낮음 | 증가 추세 | 높음 | 주간 |

## 12. 데이터 소스 정리

- `Prometheus`: RED/USE, 퍼널 카운터, 지연 시간 히스토그램
- `Loki`: 구조화 로그, `event_name`, 오류 코드, correlation ID
- `Grafana`: 대시보드, 통합 알림, 메트릭-로그 연결
- `트레이스`: 1차 범위에서는 미수집, 향후 OpenTelemetry/Tempo 도입 시 확장
- `수동 리뷰 시트`: 요약 유용성, 시나리오 pass/fail 점검용

## 13. 운영 리뷰 주기

- **매일**: API 건강, 알림 노이즈, 로그 적재 상태
- **매주**: 퍼널 성과, 인시던트 커버리지, 요약 유용성
- **시나리오 실행 시마다**: 알림, 로그, 대시보드, 요약의 end-to-end 확인
- **phase 종료 시**: 기준선 보정과 임계치 재설정

## 14. 구현 메모

- 1차는 Grafana 안에서 제품형 지표와 운영형 지표를 함께 보여준다.
- 외부 제품 분석 툴은 붙이지 않는다.
- 트레이스는 문서에 구조를 남기되 1차 구현에서는 미수집 상태로 둔다.
- 향후 Tempo를 붙이더라도 현재 SLI/SLO/SLA 순서는 유지한다.

## 15. 레이어별 패널 정의(구현 반영)

아래 표는 Grafana 패널 기준의 운영 정의다. 각 행은 `패널명 + 역할 + 왜 보는지 + 다음 판단 + 데이터 소스 + 주요 쿼리/메트릭 + 경고 기준`을 함께 담는다.

### 15-1. Landing (`MWA / Landing`)

| 패널 | 역할 | 왜 보는가 | 다음 판단 | 데이터 소스 | 주요 쿼리/메트릭 | 경고 기준 |
|---|---|---|---|---|---|---|
| User Experience Status | 사용자 체감 품질 요약 | 사용자 영향 여부 선판단 | 이상 시 SRE 이동 | Prometheus | `mwa:user_experience_status:5m` | `< 1` |
| Business Impact Status | 주문/결제 영향 요약 | 기술 이상과 매출 영향 분리 | 이상 시 Executive/SRE | Prometheus | `mwa:business_impact_status:5m` | `< 1` |
| Infra Health Status | 인프라 건강 요약 | 리소스 병목 빠른 감지 | 이상 시 Infra 이동 | Prometheus | `mwa:infra_health_status:5m` | `< 1` |
| Critical Alerts | 현재 firing critical 알림 집계 | 즉시 대응해야 하는 알림만 압축 | 알림 유형별 SRE/Infra/Developer | Prometheus | `sum(ALERTS{alertstate="firing",severity="critical"})` | `>= 1` |
| API 5xx Ratio (5m) | 서버 오류 비율 | 요청 실패 증가 확인 | 상승 시 SRE 이동 | Prometheus | `mwa:http_5xx_ratio:5m` | `> 0.03` |
| API p95 Latency (5m) | 상위 지연 시간 | SRE 기준과 같은 체감 지연 기준 확인 | 상승 시 SRE, 필요 시 Infra | Prometheus | `mwa:http_latency_p95_seconds:5m` | `> 1.0s` |

### 15-2. SRE (`MWA / SRE`)

| 패널 | 역할 | 왜 보는가 | 다음 판단 | 데이터 소스 | 주요 쿼리/메트릭 | 경고 기준 |
|---|---|---|---|---|---|---|
| Service Availability | 서비스 응답 가능 여부 | 다운/성능저하 구분 | 비정상 시 Developer/Infra | Prometheus | `max(up{job="mwa-backend"})` | `< 1` |
| 5xx Ratio (5m) | 서버 오류 비율 | 내부 오류 원인 여부 | 급증 시 Developer | Prometheus | `mwa:http_5xx_ratio:5m` | `> 0.03` |
| Latency p95 (5m) | 상위 지연 시간 | 일부 요청 지연 조기 감지 | 상승 시 Infra/Developer | Prometheus | `mwa:http_latency_p95_seconds:5m` | `> 1.0s` |
| Traffic RPS | 요청량 변화 | 부하 급증 연관성 확인 | 급증+문제 시 Infra 우선 | Prometheus | `sum(rate(mwa_http_requests_total{service="backend"}[5m]))` | 추세 이탈 |
| Order Success Ratio (5m) | 주문 성공 비율 | 핵심 행동 실패 확인 | 저하 시 Executive 후 Developer | Prometheus | `mwa:order_create_success_ratio:5m` | `< 0.99` |
| Payment Completion Ratio (5m) | 결제 완료 비율 | 민감 퍼널 품질 확인 | 저하 시 Executive 후 Developer | Prometheus | `mwa:payment_completion_ratio:5m` | `< 0.95` |
| Apdex Score | 체감 만족도 점수 | 불편 사용자 비율 판단 | 하락 시 SRE 이상 확정 | Prometheus | `mwa:apdex_score:5m` | `< 0.85` |
| Saturation Warning Summary | 포화 warning 개수 | 자원 포화 원인 압축 | 1 이상 시 Infra 이동 | Prometheus | `mwa:saturation_warning_score:5m` | `> 0` |

### 15-3. Infra (`MWA / Infra`)

| 패널 | 역할 | 왜 보는가 | 다음 판단 | 데이터 소스 | 주요 쿼리/메트릭 | 경고 기준 |
|---|---|---|---|---|---|---|
| Host CPU Usage | 호스트 CPU 사용률 | 전체 CPU 병목 확인 | 고사용 지속 시 원인 분석 | Prometheus | `node_cpu_seconds_total` 기반 | `> 80%` |
| Host Memory Usage | 호스트 메모리 사용률 | OOM/swap 위험 확인 | 높으면 컨테이너 메모리 확인 | Prometheus | `node_memory_*` 기반 | `> 85%` |
| Container CPU Usage | 컨테이너별 CPU | 특정 서비스 과부하 분리 | 특정 컨테이너 집중 시 Developer | Prometheus | `container_cpu_usage_seconds_total` | 추세 이탈 |
| Container CPU Throttling | CPU 스로틀링 | 제한 설정 병목 확인 | 증가 시 리밋/리퀘스트 재검토 | Prometheus | `container_cpu_cfs_throttled_seconds_total` | 지속 증가 |
| Container Memory Usage / Limit % | 컨테이너 메모리 limit 대비 사용률 | OOM/GC 압박을 한계 대비로 확인 | 한계 근접 시 restart/OOM 확인 | Prometheus | `container_memory_working_set_bytes / container_spec_memory_limit_bytes` | 한계 근접 |
| OOM / Restart Reason | 재시작 원인 로그 | 재시작 원인 분류 | 앱 오류는 Developer, 자원은 Infra | Loki | `OOMKilled|CrashLoopBackOff|probe` | 이벤트 발생 |
| DB Connections Used % | DB 커넥션 사용률 | 커넥션 고갈 확인 | 높으면 쿼리/풀 점검 | Prometheus | `mwa:db_connections_used_ratio:5m` | `> 85%` |
| DB Deadlocks | DB deadlock 발생 | DB가 살아도 요청 정체 가능 | 증가 시 SQL/트랜잭션 추적 | Prometheus | `pg_stat_database_deadlocks` | deadlock 증가 |
| Disk Usage % | 디스크 사용률 | 단일 호스트 disk full 위험 확인 | 증가 시 로그/DB 볼륨 정리 | Prometheus | `node_filesystem_*` | 한계 근접 |
| Disk IO Wait | 디스크 I/O 대기 | CPU가 낮아도 느린 저장소 병목 확인 | 증가 시 DB/로그 I/O 확인 | Prometheus | `node_cpu_seconds_total{mode="iowait"}` | 추세 이탈 |
| Network Errors / Drops | 네트워크 error/drop | 외부 통신/컨테이너 네트워크 이상 확인 | 증가 시 네트워크 경로 점검 | Prometheus | `node_network_*_errs_total`, `node_network_*_drop_total` | 이벤트 발생 |
| Worker Queue Lag | 비동기 지연 | 후처리 지연 감지 | 증가 시 worker 점검 | Prometheus | `mwa:worker_queue_lag:5m` | TODO(미계측) |
| Thread/Pool Saturation | 내부 pool 포화 | 앱/인프라 경계 병목 확인 | 포화 시 Developer 병렬 분석 | Prometheus | `mwa:thread_pool_saturation:5m` | TODO(미계측) |

### 15-4. Developer (`MWA / Developer`)

| 패널 | 역할 | 왜 보는가 | 다음 판단 | 데이터 소스 | 주요 쿼리/메트릭 | 경고 기준 |
|---|---|---|---|---|---|---|
| Top 5 Slow API by p95 | p95 기준 느린 API 식별 | 평균이 숨기는 꼬리 지연 endpoint 압축 | trace drill-down | Prometheus | `histogram_quantile(0.95, ...mwa_http_request_duration_seconds_bucket...)` | 상위 지연 증가 |
| Failed Request Table | 실패 요청 목록 | 실패 요청 구체 확인 | trace_id 클릭 후 추적 | Loki | `{service_name="mwa-backend"} | json | status_code >= 500` | 실패 이벤트 증가 |
| Recent Failed Traces | 실패 trace 후보 목록 | 오류 계층 빠른 파악 | trace_id 클릭 후 로그/Tempo 확인 | Loki | `{service_name="mwa-backend"} | json | trace_id != "" | status_code >= 500` | 실패 이벤트 증가 |
| Trace-selected Logs | trace 연동 로그 | trace/log 문맥 결합 | 예외/검증/외부오류 확인 | Loki | `{service_name="mwa-backend"} | json | trace_id =~ "$trace_id"` | 오류 이벤트 증가 |
| HTTP 5xx Volume by Endpoint | 5xx 집중 endpoint | 기능 단위 원인 축소 | 상위 endpoint 상세 분석 | Prometheus | `sum(increase(...)) by (handler)` | 상위 endpoint 급증 |
| Top Error Signatures | 에러 패턴 상위 | 우선 대응 대상 결정 | 대표 시그니처 대응 | Loki | `count_over_time({service_name="mwa-backend"} ... error_code ...)` | 특정 코드 burst |
| Slow SQL Mean Time | 느린 SQL | DB 기인 지연 확인 | 인덱스/락/N+1 점검 | Prometheus | `pg_stat_statements_*` | 상위 쿼리 지연 증가 |
| Payment Processing Latency | 결제 처리 지연 | 결제 처리 병목 확인 | 결제 흐름 점검 | Prometheus | `mwa:payment_processing_latency_p95_seconds:5m` | `> 1s` |
| Error Code Stream | 오류 코드 시간 흐름 | 장애 전개 양상 확인 | 배포/트래픽/인프라 비교 | Loki | `error_code != ""` | 오류 흐름 급변 |

### 15-5. Executive (`MWA / Executive`)

| 패널 | 역할 | 왜 보는가 | 다음 판단 | 데이터 소스 | 주요 쿼리/메트릭 | 경고 기준 |
|---|---|---|---|---|---|---|
| Search Success | 검색 기술 성공률 | 유입 단계 이상 확인 | 저하 시 SRE/담당 분석 | Prometheus | `mwa:search_success_ratio:5m` | `< 99.5%` |
| Search Result Exists Ratio | 결과 존재 비율 | 기술 성공/비즈니스 성공 분리 | 급락 시 인덱싱/품질 점검 | Prometheus | `mwa:search_result_exists_ratio:5m` | `< 80%` warning, `< 60%` critical |
| Cart Add Success | 장바구니 성공률 | 전환 중간 단계 확인 | 저하 시 API/재고/세션 점검 | Prometheus | `mwa:cart_add_success_ratio:5m` | `< 99%` warning, `< 95%` critical |
| Order Success | 주문 성공률 | 핵심 매출 이벤트 확인 | 저하 시 Developer | Prometheus | `mwa:order_create_success_ratio:5m` | `< 99%` warning, `< 95%` critical |
| Payment Completion | 결제 완료율 | 실질 매출 성공 판단 | 저하 시 의존성/장애 영향 분석 | Prometheus | `mwa:payment_completion_ratio:5m` | `< 95%` warning, `< 90%` critical |
| Orders Created (1h) | 실주문량 | 비율 밖 거래량 감소 확인 | baseline 대비 비교 | Prometheus | `increase(mwa_order_create_total{result="success"}[1h])` | 중립 표시, baseline 비교는 후속 |
| Conversion Delta vs Baseline | 전환 변화량 | 정상 변동/이상 감소 구분 | 유의미 감소 시 장애 영향 판단 | Prometheus | `mwa:conversion_delta_vs_baseline:5m` | `< -2%p` |
| Estimated Revenue Loss | 추정 손실 금액 | 기술 지표의 비즈니스 번역 | 손실 증가 시 우선순위 상향 | Prometheus | `mwa:estimated_revenue_loss_per_hour:5m` | KRW `>= 100000` warning, `>= 500000` critical |

## 16. 미계측 TODO 패널

- `Worker Queue Lag`: 큐 exporter 또는 app gauge 연동 필요.
- `Thread/Pool Saturation`: 런타임 thread/connection pool metric 연동 필요.
- `Recent Failed Traces`는 Loki 기반 trace 후보 목록으로 제공하며, Tempo 검색 API 기반 span 목록은 후속 보강 대상.
- `Estimated Revenue Loss`: 주문 금액 기반 손실 계산 metric 연동 필요.
