import { defineConfig } from '@playwright/test'

const webServerHost = process.env.PLAYWRIGHT_WEB_SERVER_HOST ?? '127.0.0.1'
const webServerPort = process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '40123'
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://mwa:mwa@localhost:5432/mwa?schema=public'

export default defineConfig({
  testDir: '../src',
  testMatch: '**/*.e2e.spec.ts',
  fullyParallel: false,
  workers: 1,
	reporter: [['list']],
	webServer: {
		command: `DATABASE_URL=${databaseUrl} npm run db:reset:test && DATABASE_URL=${databaseUrl} npm run db:seed && DATABASE_URL=${databaseUrl} HOST=${webServerHost} PORT=${webServerPort} npm run build && DATABASE_URL=${databaseUrl} HOST=${webServerHost} PORT=${webServerPort} npm run start`,
		port: Number(webServerPort),
		timeout: 120_000,
		reuseExistingServer: false
	}
})
