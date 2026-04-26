# Backend Phase 1 + Monitoring(계측) 티켓/이슈 실행 문서

## 목적

- `docs/planning/*` 기반으로 확정된 백엔드 구축 계획을 GitHub 이슈 단위로 실행 가능하게 정리한다.
- 범위는 `Phase 1 backend + monitoring instrumentation only`로 고정한다.

## 고정 범위

- 포함: catalog/search/recommendation(placeholder)/cart/order/mock payment, metrics/logging, monitoring stack scrape/ingestion 연결
- 제외: Grafana Alerting 규칙, 시나리오 주입 자동화, 외부 결제 연동, 배송, 외부 검색/추천 엔진

## 실행 순서표 (의존성 기준)

| 순서 | 티켓 | Wave | 작업 내용 | 선행 의존성 |
|---|---|---:|---|---|
| 1 | T1 | 1 | backend 워크스페이스 + Express/TS 기본 골격 | - |
| 2 | T2 | 1 | TDD/CI baseline (unit/integration/e2e) | T1 |
| 3 | T3 | 1 | Prisma Phase 1 물리 스키마 + migration | T1 |
| 4 | T5 | 1 | 공통 HTTP 계약 + validation + 에러코드 | T1 |
| 5 | T6 | 1 | request context + identity 규칙 | T1, T5 |
| 6 | T16 | 3 | monitoring stack에 신규 backend 타깃 연결 | T1 |
| 7 | T4 | 1 | deterministic seed/factory/reset | T3 |
| 8 | T7 | 2 | catalog API (list/detail) | T2, T3, T4, T5 |
| 9 | T8 | 2 | search API (DB-native) | T2, T3, T4, T5, T7 |
| 10 | T9 | 2 | recommendation placeholder API | T2, T3, T4, T5, T7 |
| 11 | T10 | 2 | cart API (single active cart) | T2, T3, T4, T5, T6, T7 |
| 12 | T11 | 2 | order API + checkout revalidation | T2, T3, T4, T5, T6, T10 |
| 13 | T12 | 2 | mock payment API + idempotency | T2, T3, T4, T5, T6, T11 |
| 14 | T14 | 3 | RED + funnel metrics 계측 계약 | T5, T7, T10, T11, T12 |
| 15 | T15 | 3 | structured logging + correlation | T5, T6, T7, T10, T11, T12 |
| 16 | T13 | 3 | transaction/idempotency hardening | T10, T11, T12 |
| 17 | T17 | 3 | seeded e2e smoke (success/failure) | T2,T3,T4,T5,T6,T7,T8,T9,T10,T11,T12,T13,T14,T15,T16 |

## 병렬 실행 묶음

- Wave 1: `T1` 완료 후 `T2/T3/T5/T16` 병렬, 이어서 `T6`(T5 이후), `T4`(T3 이후)
- Wave 2: `T7` 후 `T8/T9/T10` 병렬, 이어서 `T11 -> T12`
- Wave 3: `T13/T14/T15` 병렬, 마지막 `T17`

## GitHub 이슈 매핑 표

| 티켓 | 이슈 번호 | 제목 | 상태 |
|---|---:|---|---|
| T1 | [#3](https://github.com/cloud-club/09th-monitoring-with-agent/issues/3) | [T1] Initialize backend workspace and Express TypeScript skeleton | Open |
| T2 | [#4](https://github.com/cloud-club/09th-monitoring-with-agent/issues/4) | [T2] Add zero-baseline TDD, CI, and API test harness | Open |
| T3 | [#5](https://github.com/cloud-club/09th-monitoring-with-agent/issues/5) | [T3] Implement Phase 1 Prisma schema and migration boundary | Open |
| T4 | [#6](https://github.com/cloud-club/09th-monitoring-with-agent/issues/6) | [T4] Add deterministic seed, factory, and test-reset tooling | Open |
| T5 | [#7](https://github.com/cloud-club/09th-monitoring-with-agent/issues/7) | [T5] Establish HTTP contract, validation, and error-envelope foundation | Open |
| T6 | [#8](https://github.com/cloud-club/09th-monitoring-with-agent/issues/8) | [T6] Freeze identity, request context, and buyer-access semantics | Open |
| T7 | [#9](https://github.com/cloud-club/09th-monitoring-with-agent/issues/9) | [T7] Implement catalog module for product list and detail | Open |
| T8 | [#10](https://github.com/cloud-club/09th-monitoring-with-agent/issues/10) | [T8] Implement search module with DB-native semantics | Open |
| T9 | [#11](https://github.com/cloud-club/09th-monitoring-with-agent/issues/11) | [T9] Implement recommendation placeholder module | Open |
| T10 | [#12](https://github.com/cloud-club/09th-monitoring-with-agent/issues/12) | [T10] Implement cart module with one active cart per customer | Open |
| T11 | [#13](https://github.com/cloud-club/09th-monitoring-with-agent/issues/13) | [T11] Implement order module with cart revalidation and snapshot capture | Open |
| T12 | [#14](https://github.com/cloud-club/09th-monitoring-with-agent/issues/14) | [T12] Implement mock payment module with idempotent outcomes | Open |
| T13 | [#15](https://github.com/cloud-club/09th-monitoring-with-agent/issues/15) | [T13] Harden transaction boundaries and duplicate-submit behavior | Open |
| T14 | [#16](https://github.com/cloud-club/09th-monitoring-with-agent/issues/16) | [T14] Add metrics instrumentation contract | Open |
| T15 | [#17](https://github.com/cloud-club/09th-monitoring-with-agent/issues/17) | [T15] Add structured JSON logging and request-correlation contract | Open |
| T16 | [#18](https://github.com/cloud-club/09th-monitoring-with-agent/issues/18) | [T16] Wire the new backend into monitoring stack | Open |
| T17 | [#19](https://github.com/cloud-club/09th-monitoring-with-agent/issues/19) | [T17] Add seeded end-to-end smoke coverage for full funnel | Open |
