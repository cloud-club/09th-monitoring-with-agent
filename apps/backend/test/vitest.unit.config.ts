import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/vitest.setup.ts'],
    include: ['./test/unit/**/*.spec.ts'],
    exclude: ['./test/integration/**/*.it.spec.ts', './test/e2e/**/*.e2e.spec.ts', './test/live/**/*.live.it.spec.ts']
  }
})
