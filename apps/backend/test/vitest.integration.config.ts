import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./test/vitest.integration.global-setup.ts'],
    setupFiles: ['./test/vitest.setup.ts'],
		include: ['./src/**/*.it.spec.ts', './test/integration/**/*.it.spec.ts'],
		exclude: ['./src/**/*.live.it.spec.ts', './test/live/**/*.live.it.spec.ts'],
		fileParallelism: false,
		maxWorkers: 1,
  }
})
