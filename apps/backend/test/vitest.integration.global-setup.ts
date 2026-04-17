import { execFileSync } from 'node:child_process'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://mwa:mwa@localhost:5432/mwa?schema=public'

export default function globalSetup(): void {
	execFileSync('npm', ['run', 'db:reset:test'], {
		cwd: process.cwd(),
		env: {
			...process.env,
			DATABASE_URL,
		},
		stdio: 'pipe',
	})
}
