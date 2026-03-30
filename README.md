# 09th-monitoring-with-agent

## Backend workspace (`apps/backend`)

T1 baseline provides an Express + TypeScript backend skeleton.

- Fixed port: `8080`
- Health endpoint: `GET /health`
- Standard scripts: `dev`, `build`, `start`, `test`, `test:e2e`, `test:integration:live`, `typecheck`

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
