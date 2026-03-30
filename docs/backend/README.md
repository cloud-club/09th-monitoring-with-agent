# Backend bootstrap (T1)

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
```
