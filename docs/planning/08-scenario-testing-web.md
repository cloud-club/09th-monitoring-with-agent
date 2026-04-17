# 시나리오 테스팅 웹 기획서

## 1. 문서 목적

- 이 문서는 API 성공/실패 시나리오를 웹에서 정의하고 실행하며 결과를 검증하는 내부 도구의 기획 기준을 정리한다.
- 이 제품은 일반 사용자용 서비스 화면이 아니라, 개발팀이 API 동작과 관측 가능성(`health`, `metrics`, `logs`)을 빠르게 검증하는 **시나리오 테스팅 웹**을 목표로 한다.
- 별도 제품을 새로 만드는 대신, 현재 저장소의 `monitoring` 스택과 `demo` 호스트 위에 시나리오 콘솔을 올리는 방향을 기본안으로 둔다.

## 2. 왜 필요한가

### 현재 상태

- `apps/backend/src/main.ts`는 실제 백엔드 런타임 진입점이다.
- `apps/backend/src/health/health.controller.ts`와 `apps/backend/src/catalog/catalog.controller.ts`는 테스트에 바로 쓸 수 있는 `health`, `catalog` API를 제공한다.
- `monitoring/docker-compose.yml`과 `monitoring/README.md`는 Grafana, Prometheus, Loki, backend를 함께 올리는 실행 환경을 제공한다.
- `monitoring/demo/server.js`는 demo host 역할을 하며 `/health`, `/metrics`, action 흐름을 가진다.
- 저장소에는 이미 Playwright/Vitest 중심의 테스트 자산이 있다.

### 문제

- 개발자가 특정 성공/실패 시나리오를 **웹에서 빠르게 재현하고 결과를 한눈에 확인하는 표면**은 아직 없다.
- curl, Postman, 개별 스크립트, 테스트 코드가 흩어져 있어 재현 경로가 분산된다.
- API 실행 결과와 observability 확인이 분리되어 있어, 같은 시나리오를 다시 설명하고 검증하는 비용이 크다.

### 지금 만들 가치

- API contract 검증, 장애 재현, metrics 확인, 로그 상관관계를 한 화면에서 연결할 수 있다.
- 실패 재현 절차를 문서가 아닌 실행 가능한 시나리오로 남길 수 있다.
- 개발팀이 같은 시나리오 언어로 대화하고 QA 기준을 공유할 수 있다.

## 3. 대상 사용자

### 1차 사용자

- **Backend / Platform 개발자**
- 필요: “내가 만든 API가 정상과 비정상 상태에서 어떻게 보이는지, 웹에서 빠르게 실행하고 확인하고 싶다.”

### 2차 사용자

- **QA / SDET**
- 필요: “검증 케이스를 UI에서 반복 실행하고 결과를 비교하고 싶다.”

### 3차 사용자

- **Observability 담당자 / Tech Lead**
- 필요: “특정 시나리오가 metrics, logs, 대시보드에 어떻게 보이는지 하나의 흐름으로 설명하고 싶다.”

### 제외 대상

- 외부 고객
- 운영자용 범용 백오피스 사용자
- 임의 외부 API를 테스트하려는 일반 사용자

## 4. 핵심 목표

### 제품 목표

- 개발팀이 웹 UI에서 API 시나리오를 선택하거나 편집하고, 순차 또는 병렬로 실행한 뒤, 응답/검증 결과/관측 지표를 한 번에 확인할 수 있는 내부 QA 도구를 제공한다.

### 세부 목표

- 성공/실패 시나리오를 빠르게 재현할 수 있다.
- API contract 회귀를 눈으로 바로 확인할 수 있다.
- backend test만으로는 부족한 “실행 감각”과 “운영 관측 연결”을 강화한다.
- PM/QA/개발자가 같은 시나리오 이름과 기준으로 대화할 수 있다.

### 성공 기준

- v1 이후 개발팀이 웹 UI에서 최소 5개의 표준 시나리오를 실행할 수 있다.
- 성공/실패/유효성 오류/네트워크 오류를 포함한 대표 시나리오가 E2E 자동화로 재현 가능하다.
- 시나리오 실행 결과에서 각 step의 상태코드, 응답 본문 요약, assertion 결과를 100% 확인할 수 있다.
- 최소 1개의 `health` 시나리오와 1개의 `catalog` 시나리오가 metrics/logs 확인 흐름과 연결된다.
- 신규 API 계약 변경 시, 어떤 시나리오 템플릿을 업데이트해야 하는지 명확히 식별된다.

## 5. 핵심 가치 제안

### 한 문장 가치

- **API 테스트를 코드와 터미널 밖으로 꺼내, 시나리오 단위로 보고 실행하고 설명할 수 있게 만든다.**

### 기대 효과

- 반복 테스트 속도 향상
- 실패 재현 비용 감소
- 시나리오 공유 기준 통일
- backend contract와 observability의 연결 가시화

### 기존 대안 대비 차별점

- Postman보다 repo와 runtime context에 더 밀착된다.
- 단순 대시보드보다 실제 API 실행과 검증이 중심이다.
- 단순 E2E 테스트보다 사람이 읽고 조작하기 쉬운 QA 표면을 제공한다.

## 6. 제품 해법

### 6.1 기본 전달 방식

- **기존 `monitoring/demo` host를 확장하는 route-based delivery**를 기본안으로 한다.

### 이유

- `monitoring/docker-compose.yml`과 `monitoring/README.md`가 이미 monitoring stack을 제공한다.
- `monitoring/demo/server.js`가 host 역할을 하고 있다.
- 별도 앱을 새로 만들지 않고 observability stack과 바로 연결할 수 있다.
- backend와 monitoring의 실제 동작을 하나의 로컬 흐름으로 묶기 쉽다.

### 기본 진입점

- 예시 route: `/qa/scenarios`
- 이 route는 시나리오 라이브러리, 편집, 실행, 결과 확인을 위한 콘솔 역할을 한다.

## 7. 화면 구성

기본 화면은 4개 영역으로 구성한다.

### 7.1 Scenario Library

- 표준 시나리오 템플릿 목록
- 예시:
  - `health-success`
  - `metrics-text-check`
  - `catalog-list-success`
  - `catalog-detail-not-found`
  - `network-fail`

### 7.2 Scenario Editor

- 템플릿을 JSON으로 불러와 수정한다.
- `mode`: `sequential` / `parallel`
- `steps`, `timeout`, `expected status`, `assertions`를 정의한다.
- 잘못된 JSON이나 schema 위반은 실행 전에 막는다.

### 7.3 Execution Panel

- `Run`, `Reset`, `Validate` 같은 실행 제어 기능
- 실행 중 상태와 step 진행도 표시
- 순차 실행과 병렬 실행을 모두 지원

### 7.4 Results + Observability Panel

- step별 결과, status, duration, assertion pass/fail 표시
- metrics/logs/Grafana drilldown 링크 또는 관측 결과 요약 표시
- 실패 이유를 step 단위로 명확하게 보여준다.

### 간단한 text wireframe

```text
+---------------------------------------------------------------+
| Scenario Library | JSON Editor                               |
|------------------|-------------------------------------------|
| health-success   | {                                         |
| catalog-list     |   "mode": "sequential",                 |
| not-found        |   "steps": [...]                        |
| network-fail     | }                                         |
+------------------+----------------------+--------------------+
| Execution Panel                        | Result Panel        |
| Run | Reset | Validate | Mode          | Step 1 PASS         |
|                                        | Step 2 FAIL         |
|                                        | metrics/log links   |
+---------------------------------------------------------------+
```

## 8. 핵심 기능

### F1. Built-in scenario templates

- 자주 쓰는 성공/실패 시나리오를 템플릿으로 제공한다.
- 초기 템플릿은 backend의 `health`, `catalog` surface를 기준으로 만든다.

### F2. JSON-based scenario authoring

- 템플릿을 JSON으로 편집 가능하게 한다.
- schema validation으로 잘못된 입력을 실행 전에 막는다.

### F3. Sequential and parallel execution

- 순차 실행과 병렬 실행을 모두 지원한다.
- 각 mode의 결과 집계 방식이 명확해야 한다.

### F4. Assertion engine

- status code, body field, text response, duration 같은 검증 규칙을 지원한다.
- `/metrics` 같은 text 응답도 다룰 수 있어야 한다.

### F5. Step-level result inspection

- step별 request target, status, duration, assertion 결과를 보여준다.
- 실패 이유를 step 단위로 명확하게 표시한다.

### F6. Guardrails and safety

- 허용된 endpoint만 실행한다.
- 민감 헤더/값은 redaction한다.
- 임의 외부 URL 호출은 막는다.

### F7. Observability linkage

- 실행 결과를 Grafana, Prometheus, Loki와 연결해 설명할 수 있어야 한다.
- 최소한 링크 또는 drilldown entrypoint는 제공한다.

### F8. Test automation support

- Playwright/Vitest 기반 자동화와 연결된다.
- 시나리오 UI 자체도 테스트 자산으로 다룬다.

## 9. 초기 범위

### v1 대상 API

- `GET /health`
- `GET /api/catalog/products`
- `GET /api/catalog/products/:productId`
- 필요 시 `demo` host의 `health`/`metrics`/`action` 흐름을 보조 시나리오로 사용한다.

### 포함

- built-in templates
- JSON editor
- sequential / parallel execution
- status / body / text / duration assertions
- result panel
- health/catalog 중심 시나리오
- Playwright/Vitest 자동화 연결

### 제외

- 외부 고객용 polished UI
- arbitrary external API execution
- full scripting DSL
- retry/loop/branching workflow engine
- production operations console로의 확장

## 10. 전체 로드맵

### V1. Core scenario console

- 표준 시나리오 템플릿
- JSON 편집
- 순차 / 병렬 실행
- 핵심 assertion
- 결과 패널
- backend read-oriented API 중심 검증

### V2. Extended failure and observability workflows

- failure template 확장
- richer metrics/log links
- partial failure comparison UI
- 더 많은 backend endpoint coverage
- reusable scenario fixtures

### V3. Team-scale collaboration features

- 저장된 시나리오
- 실행 이력
- 공유 링크
- role-based controls
- scenario diff/history

### V4. Platform-level testing surface

- contract drift detection
- release gate integration
- CI-triggered scenario packs
- service별 scenario grouping
- 운영 리허설 / chaos-lite flows

## 11. 가정과 제약

### 가정

- 개발팀은 내부 QA 도구로서의 단순하고 실용적인 UI를 선호한다.
- 초기 대상 API는 backend read-oriented surface가 적절하다.
- observability 확인은 직접 패널 임베드보다 링크/연결 방식부터 시작해도 충분하다.
- v1에서는 저장/공유/권한보다 실행과 검증 경험이 더 중요하다.

### 제약

- 현재 monitoring host를 재사용하는 방향이므로, route/stack 제약을 존중해야 한다.
- 외부 시스템 전체를 범용으로 테스트하는 제품으로 확장하지 않는다.
- high-cardinality observability 설계를 해치지 않는 방식으로 연결해야 한다.

## 12. 구현 전 확인 항목

- route를 `monitoring/demo`에 둘지, 별도 내부 app으로 둘지 최종 결정
- v1 endpoint whitelist 확정
- scenario schema 초안 확정
- metrics/logs/Grafana 연결 수준 확정
- Playwright/Vitest 자동화 범위 확정

## 13. 관련 저장소 anchor

- `monitoring/docker-compose.yml`
- `monitoring/README.md`
- `monitoring/demo/server.js`
- `apps/backend/src/main.ts`
- `apps/backend/src/health/health.controller.ts`
- `apps/backend/src/catalog/catalog.controller.ts`
- `apps/backend/package.json`
