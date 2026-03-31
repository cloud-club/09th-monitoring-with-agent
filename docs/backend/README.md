# Backend bootstrap (NestJS) + MikroORM boundary

`apps/backend`는 Phase 1 백엔드의 기본 실행 단위다.

## Runtime contract

- Port: `8080` (fixed)
- Health endpoint: `GET /health`
- Shared HTTP contract + validation + error envelope: `docs/backend/http-contract.md`
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

## Database contract (Phase 1)

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

### Scope boundary

현재 브랜치의 MikroORM 적용 범위는 **ORM 전환 기반(bootstrap)** 까지다.

- NestJS와 MikroORM 모듈 초기화
- PostgreSQL 연결 설정 및 migration CLI 경로 고정
- 기본 엔티티(`RuntimeMarkerEntity`) 기반 ORM 부트스트랩

기존 `apps/backend/prisma/*` 산출물은 도메인 이관 작업 전까지 레거시 참조로 유지한다.
