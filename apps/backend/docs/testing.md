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

## Review policy for new tests

Every PR that adds or modifies tests must explain:

1. which regression/bug is prevented,
2. which repeated manual review task is removed.

If either explanation is missing, the test design must be revised.
