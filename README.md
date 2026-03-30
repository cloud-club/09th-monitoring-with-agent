# 09th-monitoring-with-agent

## Backend workspace (`apps/backend`)

T1 baseline provides a NestJS + TypeScript backend skeleton.

- Stack: `NestJS + Typia(type contracts) + MikroORM`
- Fixed port: `8080`
- Health endpoint: `GET /health`
- Standard scripts: `dev`, `build`, `start`, `lint`, `format`, `test`, `typecheck`

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
