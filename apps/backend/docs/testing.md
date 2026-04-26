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
- `npm run test:ci` -> required backend gate (`test:policy` + typecheck + unit + integration + e2e)
- `npm run monitoring:scenario:k6:smoke` from the repository root -> required k6 monitoring scenario smoke gate
- `BENCHMARK_BASE_URL=<url> npm run benchmark:api` -> k6 API benchmark lane (manual, not part of `test:ci`)
- `BENCHMARK_BASE_URL=<url> BENCHMARK_TARGET_VUS=5 npm run benchmark:api:smoke` -> lighter local smoke benchmark

## k6 monitoring scenario lane

- k6 scenario scripts live under `monitoring/scenario-runner/`.
- Cross-cutting scenario policy lives in `docs/contracts/scenario-runner.md`.
- The `smoke` pack is short enough for CI and is the main monitoring scenario gate.
- Full packs are manual: `npm run monitoring:scenario:k6 -- --pack all`.
- Selection precedence is `--scenario` > `SCENARIO_IDS` > `--pack` > `SCENARIO_PACK` > `smoke`.

## Benchmark lane

- Benchmark scripts live under `apps/backend/benchmarks/`.
- Benchmarks are intentionally separated from unit/integration/e2e/live tests and from the k6 smoke gate.
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

See `docs/architecture/testing.md` for repository-wide test layer definitions and review rules.
