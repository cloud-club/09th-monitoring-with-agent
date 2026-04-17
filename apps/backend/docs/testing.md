# Backend Testing Guide

## Suite contract

- `*.spec.ts`: unit tests (fast, pure behavior)
- `*.it.spec.ts`: integration tests (public app wiring with local dependencies)
- `*.e2e.spec.ts`: API e2e tests (running backend process)
- `*.live.it.spec.ts`: live integration tests (external target, opt-in only)

## Commands

- `npm run test` -> unit + integration
- `npm run test:e2e` -> API e2e only
- `LIVE_TEST=true BACKEND_LIVE_BASE_URL=<url> npm run test:integration:live` -> live integration only
- `npm run test:ci` -> required gate (`test:policy` + typecheck + unit + integration + e2e)
- `BENCHMARK_BASE_URL=<url> npm run benchmark:api` -> k6 API benchmark lane (manual, not part of `test:ci`)
- `BENCHMARK_BASE_URL=<url> BENCHMARK_TARGET_VUS=5 npm run benchmark:api:smoke` -> lighter local smoke benchmark

## Benchmark lane

- Benchmark scripts live under `apps/backend/benchmarks/`.
- k6 is intentionally separated from unit/integration/e2e/live tests.
- Local benchmark runs require the k6 CLI to be installed separately.
- GitHub Actions benchmark execution is provided by `.github/workflows/backend-benchmark.yml` and runs only through `workflow_dispatch`.

## Request-context contract coverage

- Public read contract: `GET /api/catalog/context-check`
- Buyer write contract: `POST /api/cart/items`
- `x-request-id` is echoed when provided and generated otherwise.
- `x-customer-id` is required only for buyer write coverage and must match one seeded `customers.id`.

## Review policy for new tests

Every PR that adds or modifies tests must explain:

1. which regression/bug is prevented,
2. which repeated manual review task is removed.

If either explanation is missing, the test design must be revised.
