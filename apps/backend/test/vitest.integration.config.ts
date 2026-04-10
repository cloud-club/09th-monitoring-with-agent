import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/vitest.setup.ts'],
    include: ['./src/**/*.it.spec.ts'],
    exclude: ['./src/**/*.live.it.spec.ts'],
    fileParallelism: false,
    maxWorkers: 1,
  }
})
