# Backend bootstrap (T1) + Prisma boundary (T3)

`apps/backend`는 Phase 1 백엔드의 기본 실행 단위다.

## Runtime contract

- Port: `8080` (fixed)
- Health endpoint: `GET /health`
- Health response:

```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```

## Commands

```bash
cd apps/backend
npm install
npm run dev
npm run test
npm run typecheck
npm run build
npm run db:generate
npm run db:migrate:dev
npm run db:migrate
```

## Database contract (Phase 1)

- Provider: PostgreSQL
- Prisma schema: `apps/backend/prisma/schema.prisma`
- Migration directory: `apps/backend/prisma/migrations`
- Required env: `DATABASE_URL`

`.env.example`:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mwa_backend?schema=public"
```

### Scope boundary

Phase 1 migration includes core runtime domains only:

- Catalog/Sales: `sales`, `sale_snapshots`, related unit/stock tables
- Cart/Order/Mock payment: `carts`, `cart_items`, `orders`, `order_items`, `order_payments`, `payment_attempts`
- Monitoring: `api_request_logs`, `monitoring_events`, `alert_records`

ERD-preserved-only domains (`articles`, `inquiries`, `coupons`, `coins`, `favorites`, complex actor/systematic domains) are intentionally excluded from this migration boundary.
