# Testing Architecture

This document codifies practical test rules for the application and monitoring scenario layers.

## Goal

Tests are designed to reduce repeated human review effort, not only to catch bugs.

## Required harness rules

1. Tests validate public behavior, not implementation details.
2. Unit tests prioritize cohesive domain behavior; avoid excessive mocking.
3. Entity/value-object behavior uses real instances; mock only side-effect boundaries.
4. Integration/E2E focus on high-risk paths first.
5. Slow or expensive live tests are separated from default local/CI loops.
6. k6 smoke scenarios are the required monitoring scenario gate; longer k6 packs and benchmarks stay in dedicated lanes.
7. Core tests must be enforced in CI and block merge when failing.
8. Flaky tests are treated as defects and either fixed immediately or quarantined.
9. Coverage is reference data, not a KPI.

## Test Layers

- Unit: pure parser, mapper, policy, and small domain behavior.
- Integration: Nest app + DB + public API behavior.
- E2E: running backend process and full HTTP flow.
- Monitoring scenario: k6 and chaos checks against Prometheus/Loki/Tempo/Grafana-facing signals.
- Live: external/manual target, opt-in only.

## Current Harness Mapping

- Unit: `npm run test:unit` -> Vitest `test/unit/**/*.spec.ts`
- Integration: `npm run test:integration` -> Vitest `test/integration/**/*.it.spec.ts`
- E2E(API): `npm run test:e2e` -> Playwright API tests `test/e2e/**/*.e2e.spec.ts`
- Live integration (manual): `LIVE_TEST=true BACKEND_LIVE_BASE_URL=<url> npm run test:integration:live` -> Vitest `src/**/*.live.it.spec.ts`
- Required CI gate: `npm run test:ci`
- Monitoring scenario smoke: `npm run monitoring:scenario:k6:smoke` -> k6 pack `smoke`
- Full monitoring scenarios (manual): `npm run monitoring:scenario:k6 -- --pack all`
- Benchmark lane (manual): `BENCHMARK_BASE_URL=<url> npm run benchmark:api` -> k6 script `benchmarks/api-benchmark.k6.js`

## Ownership

- `apps/backend/docs/testing.md` keeps backend command details.
- `monitoring/scenario-runner/README.md` keeps scenario runner usage details.
- This document owns cross-cutting test policy and review rules.

## LLM-generated test review checklist

When a test is generated with LLM assistance, reviewers must confirm:

- [ ] The test does not depend on private methods/internal call order.
- [ ] Mock usage is limited to external I/O boundaries.
- [ ] Test names describe domain behavior, not function internals.
- [ ] The test can fail for a real regression scenario.
- [ ] The PR explains both the prevented regression and the reduced manual review burden.
