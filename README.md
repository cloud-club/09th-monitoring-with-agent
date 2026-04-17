# 09th-monitoring-with-agent

## Backend workspace (`apps/backend`)

T1 baseline provides a NestJS + TypeScript backend skeleton.

- Stack: `NestJS + Typia(type contracts) + MikroORM`
- Fixed port: `8080`
- Health endpoint: `GET /health`
- Catalog endpoints:
  - `GET /api/catalog/products?page=1&limit=20&sort=newest|price_asc|price_desc`
  - `GET /api/catalog/products/:productId`
- Standard scripts: `dev`, `build`, `start`, `lint`, `format`, `test`, `test:e2e`, `test:integration:live`, `typecheck`
- Seed/reset scripts: `db:seed`, `db:reset:test`, `db:assert:fixtures`

### Run locally

```bash
cd apps/backend
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:8080/health
```

### Deterministic fixture baseline

```bash
cd apps/backend
npm run db:seed
npm run db:assert:fixtures
```

Known fixture keys are managed in `apps/backend/prisma/seed-data.js` and include:

- customers: `cust-demo-001`, `cust-demo-002`, `cust-seller-001`
- products: `prod-notebook`, `prod-mug`, `prod-sticker`, `prod-keyboard`, `prod-tumbler`, `prod-hoodie`
- variants: `var-notebook-std`, `var-mug-std`, `var-sticker-pack`, `var-keyboard-std`, `var-tumbler-std`, `var-hoodie-l`
