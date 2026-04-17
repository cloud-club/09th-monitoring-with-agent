import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/vitest.setup.ts'],
    include: ['./test/integration/**/*.it.spec.ts'],
    exclude: ['./test/live/**/*.live.it.spec.ts']
  }
})
