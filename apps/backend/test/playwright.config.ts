import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '../src',
  testMatch: '**/*.e2e.spec.ts',
  fullyParallel: false,
  workers: 1,
	reporter: [['list']],
	webServer: {
		command:
			'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mwa_backend PORT=38080 npm run build && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mwa_backend PORT=38080 npm run start',
		port: 38080,
		timeout: 120_000,
		reuseExistingServer: false
  }
})
