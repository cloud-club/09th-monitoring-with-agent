# ERD 도메인 문서 안내

## 목적

- `docs/planning/06-demo-erd.md`는 전체 범위와 관계를 한 번에 보는 기준 문서다.
- 이 디렉터리는 도메인별 세부 설명을 나눈 하위 문서 모음이다.
- 각 문서는 `도메인 목적`, `핵심 엔티티`, `관계`, `Phase 1 구현 여부`, `모니터링 관점`을 설명한다.

## 문서 목록

- [`docs/planning/erd/01-articles.md`](01-articles.md)
- [`docs/planning/erd/02-systematic.md`](02-systematic.md)
- [`docs/planning/erd/03-actors.md`](03-actors.md)
- [`docs/planning/erd/04-sales.md`](04-sales.md)
- [`docs/planning/erd/05-carts.md`](05-carts.md)
- [`docs/planning/erd/06-orders.md`](06-orders.md)
- [`docs/planning/erd/07-coupons.md`](07-coupons.md)
- [`docs/planning/erd/08-coins.md`](08-coins.md)
- [`docs/planning/erd/09-inquiries.md`](09-inquiries.md)
- [`docs/planning/erd/10-favorites.md`](10-favorites.md)
- [`docs/planning/erd/11-monitoring.md`](11-monitoring.md)

## 읽는 순서

1. [`docs/planning/06-demo-erd.md`](../06-demo-erd.md)로 전체 범위와 Phase 구분을 확인한다.
2. 구현 우선순위가 높은 [`Sales`](04-sales.md), [`Carts`](05-carts.md), [`Orders`](06-orders.md), [`Monitoring`](11-monitoring.md)을 먼저 읽는다.
3. 확장 보존 도메인인 [`Articles`](01-articles.md), [`Inquiries`](09-inquiries.md), [`Coupons`](07-coupons.md), [`Coins`](08-coins.md), [`Favorites`](10-favorites.md)를 읽는다.
4. 최종적으로 [`Actors`](03-actors.md), [`Systematic`](02-systematic.md)을 보고 전체 연결 구조를 확인한다.
