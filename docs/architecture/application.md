# Application Architecture

`apps/backend`는 NestJS 기반 application runtime입니다. HTTP 계약은 유지하면서 내부 구조는 feature module, shared read model, repository, observability support로 나눕니다.

## Module Shape

```text
controller
  HTTP boundary, request parsing, response envelope, request-scoped logging

service
  use case flow, domain rule, transaction orchestration

repository/read model
  raw SQL, DB row loading, persistence

mapper
  DB row -> API/domain view conversion
```

Current feature modules:

- `catalog`, `search`, `recommendation`: product read model consumers
- `cart`, `order`, `payment`: write use cases with repository boundaries
- `observability`, `request-context`, `qa`, `health`, `contract`: support modules

## Shared Read Model

`catalog`, `search`, and `recommendation` share the product snapshot read model under `apps/backend/src/product-read-model`.

- The read model owns latest snapshot SQL and product row mapping.
- Feature services choose query semantics and return public API views.
- Product identifiers remain `sales.id`; snapshot identifiers remain `sale_snapshots.id`.

## Write Use Cases

`cart`, `order`, and `payment` follow a repository-backed service pattern.

- `CustomerLockService` owns customer advisory lock transaction orchestration.
- Domain services validate state transitions and conflict cases.
- Repositories own SQL details and persistence/reload operations.
- Demo-only seeded address ownership lives in `DemoAddressPolicy`, not directly in `OrderService`.

## Runtime contract

- Port: `8080` (fixed)
- Health endpoint: `GET /health`
- Shared HTTP contract + validation + error envelope: `docs/contracts/http-api.md`
- Metrics endpoint: `GET /metrics`
- Catalog endpoints:
  - `GET /api/catalog/products?page=1&limit=20&sort=newest|price_asc|price_desc`
  - `GET /api/catalog/products/:productId`
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

Catalog list/detail responses use `sales.id` as `product_id` and `sale_snapshots.id` as `snapshot_id`. Variant payloads expose `variant_id`, price fields, stock quantity, and explicit `is_available` state without leaking preserved-domain relations.

## Commands

```bash
cd apps/backend
npm install
npm run dev
npm run lint
npm run format:check
npm run test
npm run test:e2e
npm run test:integration:live
npm run test:ci
npm run typecheck
npm run build
npm run db:migrate:dev
npm run db:migrate
npm run db:seed
npm run db:reset:test
npm run db:assert:fixtures
```

## Lint / Formatter

- ESLint: `apps/backend/eslint.config.mjs` (`@ryoppippi/eslint-config` 기반)
- Type-aware lint project: `apps/backend/tsconfig.eslint.json`
- Prettier: `apps/backend/prettier.config.mjs`
- Auto-fix: `npm run lint:fix`
- Auto-format: `npm run format` (`.ts`는 ESLint fix, `json/mjs`는 Prettier)

## Database Contract

- Provider: PostgreSQL
- ORM config: `apps/backend/mikro-orm.config.ts`
- Runtime config source: `apps/backend/src/database/mikro-orm.config.ts`
- Migration directory: `apps/backend/src/migrations`
- Required env: `DATABASE_URL`

`.env.example`:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mwa_backend"
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

### Scope Boundary

Runtime DB access uses MikroORM `EntityManager` and raw SQL for the current demo backend. Prisma assets remain for schema/seed compatibility until a future persistence migration removes that boundary.

- NestJS and MikroORM module bootstrap stay in `DatabaseModule`.
- `apps/backend/prisma/*` remains the deterministic fixture and seed surface.
- New runtime SQL should live in repository/read-model classes, not controllers.
