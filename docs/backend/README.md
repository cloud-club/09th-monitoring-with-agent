# Backend bootstrap (NestJS) + MikroORM boundary

`apps/backend`는 Phase 1 백엔드의 기본 실행 단위다.

## Runtime contract

- Port: `8080` (fixed)
- Health endpoint: `GET /health`
- Shared HTTP contract + validation + error envelope: `docs/backend/http-contract.md`
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
npm run db:migrate:dev
npm run db:migrate
```

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

### Scope boundary

현재 브랜치의 MikroORM 적용 범위는 **ORM 전환 기반(bootstrap)** 까지다.

- NestJS와 MikroORM 모듈 초기화
- PostgreSQL 연결 설정 및 migration CLI 경로 고정
- 기본 엔티티(`RuntimeMarkerEntity`) 기반 ORM 부트스트랩

기존 `apps/backend/prisma/*` 산출물은 도메인 이관 작업 전까지 레거시 참조로 유지한다.
