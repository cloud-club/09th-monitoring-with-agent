import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './',
  testMatch: '**/*.e2e.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  webServer: {
    command: 'PORT=38080 npm run build && PORT=38080 npm run start',
    port: 38080,
    timeout: 120_000,
    reuseExistingServer: false
  }
})
