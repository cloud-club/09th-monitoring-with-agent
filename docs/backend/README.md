# Backend bootstrap (T1) + Prisma boundary (T3)

`apps/backend`는 Phase 1 백엔드의 기본 실행 단위다.

## Runtime contract

- Port: `8080` (fixed)
- Health endpoint: `GET /health`
- Metrics endpoint: `GET /metrics`
- Health response:

```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```

Metrics endpoint returns Prometheus text format and includes `mwa_http_requests_total`.

## Commands

```bash
cd apps/backend
npm install
npm run dev
npm run test
npm run test:e2e
npm run test:integration:live
npm run typecheck
npm run build
npm run db:generate
npm run db:migrate:dev
npm run db:migrate
npm run db:seed
npm run db:reset:test
npm run db:assert:fixtures
```

## Database contract (Phase 1)

- Provider: PostgreSQL
- Prisma schema files: `apps/backend/prisma/*.prisma`
- Migration directory: `apps/backend/prisma/migrations`
- Required env: `DATABASE_URL`

`.env.example`:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mwa_backend?schema=public"
```

실제 로컬 도커 PostgreSQL(`monitoring/docker-compose.yml`)과 맞추려면 아래 값을 사용한다:

```bash
DATABASE_URL="postgresql://mwa:mwa@localhost:5432/mwa?schema=public"
```

### Deterministic fixture contract (T4)

- Fixture key catalog: `apps/backend/prisma/seed-data.js`
- Seed entry: `apps/backend/prisma/seed.js`
- Reusable factories: `apps/backend/prisma/factories.js`
- Fixture assertion script: `apps/backend/test/fixtures/assert-deterministic-seed.js`

### Scope boundary

Phase 1 migration includes core runtime domains only:

- Catalog/Sales: `sales`, `sale_snapshots`, related unit/stock tables
- Cart/Order/Mock payment: `carts`, `cart_items`, `orders`, `order_items`, `order_payments`, `payment_attempts`
- Monitoring: `api_request_logs`, `monitoring_events`, `alert_records`

ERD-preserved-only domains (`articles`, `inquiries`, `coupons`, `coins`, `favorites`, complex actor/systematic domains) are intentionally excluded from this migration boundary.

### Domain-based Prisma layout

`docs/planning/erd/` 문서 구조를 따라 도메인별로 분리한다.

- `apps/backend/prisma/00-base.prisma`: generator/datasource/enum
- `apps/backend/prisma/03-actors.prisma`: customers, addresses
- `apps/backend/prisma/04-sales.prisma`: sales, snapshots, units, stocks
- `apps/backend/prisma/05-carts.prisma`: carts, cart_items, cart_item_stocks, choices
- `apps/backend/prisma/06-orders.prisma`: orders, order_items, order_payments, payment_attempts
- `apps/backend/prisma/11-monitoring.prisma`: monitoring_events, api_request_logs, alert_records
