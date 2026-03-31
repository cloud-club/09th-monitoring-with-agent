import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/vitest.setup.ts'],
    include: ['./src/**/*.spec.ts'],
    exclude: ['./src/**/*.it.spec.ts', './src/**/*.e2e.spec.ts', './src/**/*.live.it.spec.ts']
  }
})
