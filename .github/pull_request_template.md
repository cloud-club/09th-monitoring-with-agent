## Summary

- [ ] Describe what changed.

## Test impact (required)

- Blocked regression/bug:
  - [ ] Explain what bug this test prevents.
- Manual review reduction:
  - [ ] Explain what repeated human check this removes.

## LLM-assisted test review (required if AI-assisted)

- [ ] No private/internal implementation coupling in assertions.
- [ ] No excessive mocks (external I/O only).
- [ ] Test names are domain/use-case oriented.
- [ ] Added tests can fail on realistic regressions.

## Verification

- [ ] `cd apps/backend && npm run typecheck`
- [ ] `cd apps/backend && npm run test:unit`
- [ ] `cd apps/backend && npm run test:integration`
- [ ] `cd apps/backend && npm run test:e2e`
- [ ] `cd apps/backend && npm run test:ci`
