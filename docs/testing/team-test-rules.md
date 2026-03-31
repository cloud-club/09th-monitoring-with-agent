# Backend Test Harness Operating Rules

This document codifies practical test rules for `apps/backend`.

## Goal

Tests are designed to reduce repeated human review effort, not only to catch bugs.

## Required harness rules

1. Tests validate public behavior, not implementation details.
2. Unit tests prioritize cohesive domain behavior; avoid excessive mocking.
3. Entity/value-object behavior uses real instances; mock only side-effect boundaries.
4. Integration/E2E focus on high-risk paths first.
5. Slow or expensive live tests are separated from default local/CI loops.
6. Benchmarks use a dedicated k6 lane and never run inside the default `test:ci` path.
7. Core tests must be enforced in CI and block merge when failing.
8. Flaky tests are treated as defects and either fixed immediately or quarantined.
9. Coverage is reference data, not a KPI.

## Current backend harness mapping

- Unit: `npm run test:unit` -> Vitest `src/**/*.spec.ts`
- Integration: `npm run test:integration` -> Vitest `src/**/*.it.spec.ts` (except `*.live.it.spec.ts`)
- E2E(API): `npm run test:e2e` -> Playwright API tests `src/**/*.e2e.spec.ts`
- Live integration (manual): `LIVE_TEST=true BACKEND_LIVE_BASE_URL=<url> npm run test:integration:live` -> Vitest `src/**/*.live.it.spec.ts`
- Required CI gate: `npm run test:ci`
- Benchmark lane (manual): `BENCHMARK_BASE_URL=<url> npm run benchmark:api` -> k6 script `benchmarks/api-benchmark.k6.js`

## LLM-generated test review checklist

When a test is generated with LLM assistance, reviewers must confirm:

- [ ] The test does not depend on private methods/internal call order.
- [ ] Mock usage is limited to external I/O boundaries.
- [ ] Test names describe domain behavior, not function internals.
- [ ] The test can fail for a real regression scenario.
- [ ] The PR explains both the prevented regression and the reduced manual review burden.
