# monitoring/app

Frontend SSR baseline workspace for issue #20.

## Goals

- Run independently as its own Node process
- Consume backend APIs (default `http://localhost:8080`)
- Expose local health endpoint: `GET /health`
- Stay isolated from `monitoring/demo`

## Environment

- `PORT` (default: `8081`)
- `BACKEND_API_BASE_URL` (default: `http://localhost:8080`)

## Scripts

- `dev`
- `build`
- `start`
- `lint`
- `test:unit`
- `test:integration`
- `test:e2e`
- `coverage`

## Quick start

```bash
npm --prefix monitoring/app install
npm --prefix monitoring/app run dev
curl http://localhost:8081/health
```
