import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const [, , scriptPath, ...extraArgs] = process.argv

if (!scriptPath) {
	console.error('Usage: node scripts/run-k6-benchmark.mjs <script-path> [k6 flags...]')
	process.exit(1)
}

const summaryExportPath = process.env.K6_SUMMARY_EXPORT ?? 'benchmarks/results/summary.json'
mkdirSync(dirname(resolve(summaryExportPath)), { recursive: true })

const checkBinary = spawnSync('k6', ['version'], { stdio: 'ignore' })

if (checkBinary.error) {
	console.error('k6 CLI is not installed. Install k6 first: https://grafana.com/docs/k6/latest/set-up/install-k6/')
	process.exit(1)
}

const forwardedEnvNames = [
	'BENCHMARK_BASE_URL',
	'BENCHMARK_TARGET_VUS',
	'BENCHMARK_RAMP_UP',
	'BENCHMARK_STEADY_STATE',
	'BENCHMARK_RAMP_DOWN',
]

const envArgs = forwardedEnvNames.flatMap((name) => {
	const value = process.env[name]

	return value === undefined ? [] : ['-e', `${name}=${value}`]
})

if (!forwardedEnvNames.includes('BENCHMARK_BASE_URL') || process.env.BENCHMARK_BASE_URL === undefined) {
	envArgs.push('-e', 'BENCHMARK_BASE_URL=http://127.0.0.1:8080')
}

const k6Args = ['run', ...envArgs, '--summary-export', summaryExportPath, ...extraArgs, scriptPath]

const result = spawnSync('k6', k6Args, {
	stdio: 'inherit',
	env: process.env,
})

if (result.status !== 0) {
	process.exit(result.status ?? 1)
}
