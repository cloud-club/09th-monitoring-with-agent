import { execFileSync } from 'node:child_process'

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://mwa:mwa@localhost:5432/mwa?schema=public'
const env = {
	...process.env,
	DATABASE_URL: databaseUrl,
	PLAYWRIGHT_WEB_SERVER_PORT: process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '40124',
}

function runReset() {
	execFileSync('npm', ['run', 'db:reset:test'], {
		cwd: process.cwd(),
		env,
		stdio: 'inherit',
	})
}

function runScenario(grepPattern, port) {
	execFileSync('npx', ['playwright', 'test', '-c', 'test/playwright.config.ts', 'src/t17-full-funnel.e2e.spec.ts', '-g', grepPattern], {
		cwd: process.cwd(),
		env: {
			...env,
			PLAYWRIGHT_WEB_SERVER_PORT: port,
			T17_SKIP_INTERNAL_RESET: '1',
		},
		stdio: 'inherit',
	})
}

runReset()
runScenario('success funnel', '40124')
runReset()
runScenario('failure funnel', '40125')
