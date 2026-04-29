# 운영 기준표

## 1. 목적

- 이 문서는 데모 프로젝트에서 팀이 함께 보는 운영 기준표다.
- 아래 다섯 항목을 기준선으로 사용한다.
  - `SLI 기준 / 정의서`
  - `장애 유형`
  - `알림 설정`
  - `지표 분류`
  - `운영 우선순위`

## 2. 지표 분류

| 구분 | 돈을 지키기 위한 모니터링 | 돈을 벌기 위한 모니터링 |
|---|---|---|
| 핵심 목적 | 손실 방지, 운영 안정성 확보 | 성장, 전환, 성과 최적화 |
| 주요 대상 | 장애, 성능, 안정성, 오류, 자원 고갈 | 검색 성과, 장바구니 전환, 주문 성공, 결제 성공 |
| 대표 질문 | 서비스가 멈추지 않는가? 문제를 빨리 알 수 있는가? | 서비스가 실제 성과를 만들고 있는가? |
| 주된 활용 부서 | SRE, DevOps, Backend, Platform | Product, Growth, Business |
| 대표 지표 | CPU, 메모리, 5xx 오류율, p95 지연 시간 | 검색 성공률, 장바구니 전환율, 주문 성공률, 결제 완료율 |

## 3. SLI 기준 / 정의서

| ID | 사용자 흐름 | SLI | 좋은 이벤트 | 전체 이벤트 | 측정 창 | 기준선 | 목표값 | 오너 | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| SLI-01 | 상품 검색 | 검색 성공률 | `2xx search 응답` | `전체 search 요청` | `5분`, `1시간`, `7일` | `TBD` | `>= 99.5%` | `TBD` | 봇 트래픽 제외 여부 추후 결정 |
| SLI-02 | 상품 검색 | 검색 p95 지연 시간 | `1초 이하 search 응답` | `전체 search 요청` | `5분`, `1시간` | `TBD` | `<= 1초` | `TBD` | 저트래픽이면 percentile 대신 절대건수도 검토 |
| SLI-03 | 상품 상세 | 상세 조회 p95 | `700ms 이하 detail 응답` | `전체 detail 요청` | `5분`, `1시간` | `TBD` | `<= 700ms` | `TBD` | |
| SLI-04 | 장바구니 | 장바구니 담기 성공률 | `성공한 cart add` | `전체 cart add 시도` | `5분`, `1시간`, `7일` | `TBD` | `>= 99.5%` | `TBD` | |
| SLI-05 | 주문 생성 | 주문 생성 성공률 | `성공한 order create` | `전체 order create 시도` | `5분`, `1시간`, `7일` | `TBD` | `>= 99.0%` | `TBD` | 핵심 비즈니스 흐름 |
| SLI-06 | 결제 단계 | 결제 완료율 | `payment.succeeded` | `payment.started` | `5분`, `1시간`, `7일` | `TBD` | `>= 90%` | `TBD` | 모의 결제 기준 |
| SLI-07 | 추천 | 추천 응답 p95 | `500ms 이하 recommendation 응답` | `전체 recommendation 요청` | `5분`, `1시간` | `TBD` | `<= 500ms` | `TBD` | 내부 플레이스홀더 기준 |
| SLI-08 | 추천 | 추천 결과 존재율 | `결과가 1개 이상 있는 추천 응답` | `전체 recommendation 요청` | `1시간`, `7일` | `TBD` | `TBD` | `TBD` | 허용 기준 추후 합의 |

## 4. 장애 유형

| 장애 ID | 유형 | 트리거 신호 | 사용자 영향 | 심각도 | 주요 데이터 소스 | 첫 확인 항목 |
|---|---|---|---|---|---|---|
| INC-01 | 인프라 포화 | CPU `> 80%` 5분 | 전체 응답 지연 | 중간 | Prometheus | 프로세스/컨테이너 사용률 |
| INC-02 | 메모리 압박 | 메모리 `> 85%` 5분 | 불안정, 재시작 위험 | 높음 | Prometheus | 메모리 추세, 재시작 수 |
| INC-03 | API 오류 급증 | 5xx `> 3%` 5분 | 사용자 요청 실패 | 높음 | Prometheus, Loki | 실패 엔드포인트, 최근 오류 로그 |
| INC-04 | API 지연 급증 | p95 `> 1초` 5분 | 체감 성능 저하 | 중간 | Prometheus | 느린 핸들러, 직전 배포/부하 |
| INC-05 | 퍼널 이탈 급증 | 장바구니->주문 전환 급감 | 매출성 흐름 저하 | 중간 | Prometheus, Grafana | 단계별 카운트 비교 |
| INC-06 | 주문 생성 실패 | 5분 내 주문 실패 5건 초과 | 체크아웃 차단 | 높음 | Prometheus, Loki | 검증 오류, 저장 실패 |
| INC-07 | 결제 실패 급증 | 결제 실패율 `> 10%` | 주문 완료 차단 | 높음 | Prometheus, Loki | 결제 결과 코드, 요청 흐름 |
| INC-08 | 검색 품질 저하 | zero-result rate 급증 | 탐색 실패 | 중간 | Prometheus, Loki | 검색어 패턴, 카탈로그 공백 |
| INC-09 | 동일 오류 반복 | 동일 error_code burst | 국지적 기능 불안정 | 중간 | Loki | 오류 코드, endpoint, correlation |
| INC-10 | 요약 모듈 실패 | summary 생성 실패 | 운영 가시성 저하 | 낮음 | 로그 | 룰 엔진, 질의 실패 |

## 5. 알림 설정

| 알림명 | 데이터 소스 | 질의 유형 | 조건 | 유지 시간 | 심각도 | 알림 경로 | 액션 가능 여부 |
|---|---|---|---|---|---|---|---|
| `ServiceDown` | Prometheus | PromQL | `up == 0` | `1분` | 치명 | `TBD` | 예 |
| `HighCPUUsage` | Prometheus | PromQL | `CPU > 80%` | `5분` | 중간 | `TBD` | 예 |
| `HighMemoryUsage` | Prometheus | PromQL | `Memory > 85%` | `5분` | 높음 | `TBD` | 예 |
| `APIHighErrorRate` | Prometheus | PromQL | `5xx rate > 3%` | `5분` | 높음 | `TBD` | 예 |
| `APIHighLatencyP95` | Prometheus | PromQL | `p95 > 1초` | `5분` | 중간 | `TBD` | 예 |
| `OrderCreateFailures` | Prometheus | PromQL | `5분 내 실패 5건 초과` | `5분` | 높음 | `TBD` | 예 |
| `PaymentFailureSpike` | Prometheus | PromQL | `결제 실패율 > 10%` | `5분` | 높음 | `TBD` | 예 |
| `RepeatedErrorCodeBurst` | Loki | LogQL | `동일 error_code burst` | `5분` | 중간 | `TBD` | 예 |

### 5-1. AIOps 리포트 파이프라인

MVP 알림 리포트 경로는 다음과 같다.

```text
Prometheus alert rule -> Alertmanager -> Backend webhook -> Prometheus/Loki/Tempo evidence -> Local LLM -> Email
```

- Alertmanager webhook: `POST /internal/alertmanager/webhook`
- 인증: `ALERTMANAGER_WEBHOOK_TOKEN`이 설정되어 있으면 `Authorization: Bearer <token>` 필요
- 로컬 SMTP sink: Mailpit `http://127.0.0.1:8025`
- LLM: `AIOPS_LLM_ENABLED=false`가 기본값이며, 비활성/실패 시 fallback report를 발송한다.

| Prometheus Alert | Backend incident type | Service | 리포트 발송 |
|---|---|---|---|
| `PaymentFailureSpike` | `payment_failure` | `payment` | 예 |
| `CheckoutLatencySpike` | `checkout_latency_spike` | `checkout` | 예 |
| `APIHighErrorRate` | `error_burst` | `backend` | 예 |
| 그 외 alert | 미지원 | - | MVP에서는 무시 |

Alertmanager `fingerprint`는 email dedup의 기본 입력으로 사용한다. fingerprint가 없으면 backend가 alert label과 `startsAt`으로 안정적인 hash를 생성한다.

### 알림 원칙

- 모든 알림은 실제 행동으로 이어져야 한다.
- 인프라 알림과 비즈니스 알림을 모두 가진다.
- 로그 기반 알림도 `Grafana Unified Alerting`으로 통합한다.
- 알림에는 요약, 영향 범위, 첫 확인 항목이 함께 있어야 한다.

## 6. 운영 우선순위

| 우선순위 | 운영 대상 | 설명 |
|---|---|---|
| P0 | 서비스 다운, 주문/결제 불가 | 즉시 대응 대상 |
| P1 | 주문 생성 실패, 결제 실패 급증 | 데모 핵심 가치에 직접 영향 |
| P2 | 검색 품질 저하, 장바구니 이탈 급증 | 전환 저하와 사용자 불편 유발 |
| P3 | 추천 품질 저하, 요약 모듈 실패 | 보조 기능 저하, 후속 대응 가능 |

## 7. 리뷰 체크리스트

- 각 SLI는 좋은 이벤트와 전체 이벤트가 모두 정의되어 있는가?
- 각 장애 유형은 어떤 로그/메트릭으로 확인할지 명확한가?
- 각 알림은 운영자가 바로 행동할 수 있는가?
- 돈을 지키는 지표와 돈을 버는 지표가 모두 존재하는가?
- 운영 우선순위가 퍼널 중요도와 일치하는가?

## 8. 레이어 라우팅 운영 기준(구현 반영)

- `Landing`: `User Experience Status`, `Business Impact Status`, `Infra Health Status`로 1차 분기.
- `SRE`: `Availability`, `5xx`, `p95`, `Apdex`, `Saturation`으로 사용자 영향 확정.
- `Infra`: host/container/DB 지표로 병목 후보 압축.
- `Developer`: endpoint/trace/log/error signature로 포렌식.
- `Executive`: 퍼널 성공률 + baseline 대비 감소량으로 손실 판단.

## 9. 구현된 Recording Rule / Alert 확장

### 9-1. 신규 Recording Rule

| 분류 | Rule | 용도 |
|---|---|---|
| Landing 상태 | `mwa:user_experience_status:5m` | 사용자 체감 이상 요약 |
| Landing 상태 | `mwa:business_impact_status:5m` | 주문/결제 영향 요약 |
| Landing 상태 | `mwa:infra_health_status:5m` | 인프라 건강 요약 |
| SRE | `mwa:apdex_score:5m` | 체감 만족도 지표 |
| SRE/Infra | `mwa:saturation_warning_score:5m` | 포화 warning 집계 |
| Infra | `mwa:db_connections_used_ratio:5m` | DB connection 사용률 |
| Executive | `mwa:conversion_delta_vs_baseline:5m` | 평시 대비 전환률 델타 |
| Developer | `mwa:payment_processing_latency_p95_seconds:5m` | 결제 처리 지연 p95 |
| Placeholder | `mwa:worker_queue_lag:5m` | TODO(큐 계측 대기) |
| Placeholder | `mwa:thread_pool_saturation:5m` | TODO(pool 계측 대기) |
| Placeholder | `mwa:estimated_revenue_loss_per_hour:5m` | TODO(매출 손실 계측 대기) |

### 9-2. 신규 Alert

| Alert | 조건 | 목적 |
|---|---|---|
| `LowApdexScore` | `mwa:apdex_score:5m < 0.85` for `10m` | 체감 품질 하락 조기 감지 |
| `SaturationWarningSummary` | `mwa:saturation_warning_score:5m > 0` for `10m` | 자원 포화 경고 집계 |
| `BusinessImpactDegraded` | `mwa:business_impact_status:5m < 1` for `10m` | 비즈니스 영향 감지 |
| `CheckoutLatencySpike` | 주문 생성 또는 결제 시도 p95 `> 1초` for `5m` | 체크아웃 지연 AIOps 리포트 트리거 |

## 10. 미계측 항목 처리 정책

- 대시보드에는 패널을 유지한다.
- 규칙은 `vector(0)` placeholder로 정의해 쿼리 오류를 방지한다.
- 운영 문서에는 `TODO(미계측)`로 명시한다.
