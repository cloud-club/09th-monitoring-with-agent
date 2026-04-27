# Documentation

이 저장소의 문서는 목적별로 나뉩니다.

## Architecture

- `architecture/overview.md`: application / monitoring / testing 세 축의 전체 지도
- `architecture/application.md`: NestJS 백엔드 구조와 책임 경계
- `architecture/monitoring.md`: signal flow, dashboard, fault injection 구조
- `architecture/testing.md`: 테스트 레인과 CI/수동 검증 기준

## Contracts

- `contracts/http-api.md`: HTTP response envelope, validation, pagination, error code
- `contracts/telemetry.md`: metrics, logs, traces, fault injection contract
- `contracts/scenario-runner.md`: k6/chaos scenario runner contract
- `contracts/email-notifier.md`: incident email report, local LLM, SMTP, dedup contract

## Operations

- `operations/local-runbook.md`: 로컬 stack 실행, 중지, 복구, troubleshooting
- `operations/dashboards.md`: Grafana dashboard 레이어와 패널 정의
- `operations/alerts.md`: SLI/SLO, 장애 유형, alert 기준
- `operations/email-notifier-policy.md`: Email Notifier 리스크 대응과 발송 정책

## Planning

- `planning/current-roadmap.md`: 현재 유효한 구현 흐름
- `planning/erd/`: 장기 도메인/ERD 참고 문서
- `planning/archive/`: 과거 초안, 티켓 실행 문서, 제품 기획 메모
