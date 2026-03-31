import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const [, , inputPath, outputPath] = process.argv

if (!inputPath || !outputPath) {
	console.error('Usage: node scripts/format-k6-summary.mjs <summary-json> <output-markdown>')
	process.exit(1)
}

const summary = JSON.parse(readFileSync(resolve(inputPath), 'utf8'))
const metrics = summary.metrics ?? {}

const getMetricValues = (metricName) => metrics[metricName]?.values ?? {}
const getNumber = (metricName, valueName) => {
	const value = getMetricValues(metricName)[valueName]
	return typeof value === 'number' ? value : undefined
}

const formatMs = (value) => (value === undefined ? '-' : `${Math.round(value)}ms`)
const formatRate = (value) => (value === undefined ? '-' : `${(value * 100).toFixed(2)}%`)
const formatNumber = (value) => (value === undefined ? '-' : value.toLocaleString('en-US'))
const formatRatePerSecond = (value) => (value === undefined ? '-' : `${value.toFixed(2)}/s`)

const summaryRows = [
	['Total requests', formatNumber(getNumber('http_reqs', 'count')), '-'],
	['Requests/sec', formatRatePerSecond(getNumber('http_reqs', 'rate')), '-'],
	['Avg latency', formatMs(getNumber('http_req_duration', 'avg')), '-'],
	['Median latency', formatMs(getNumber('http_req_duration', 'med')), '-'],
	['P90 latency', formatMs(getNumber('http_req_duration', 'p(90)')), getNumber('http_req_duration', 'p(90)') !== undefined ? 'PASS' : '-'],
	['P95 latency', formatMs(getNumber('http_req_duration', 'p(95)')), getNumber('http_req_duration', 'p(95)') !== undefined && getNumber('http_req_duration', 'p(95)') < 750 ? 'PASS' : 'FAIL'],
	['Max latency', formatMs(getNumber('http_req_duration', 'max')), '-'],
	['Error rate', formatRate(getNumber('http_req_failed', 'rate')), getNumber('http_req_failed', 'rate') !== undefined && getNumber('http_req_failed', 'rate') < 0.01 ? 'PASS' : 'FAIL'],
	['Check success rate', formatRate(getNumber('checks', 'rate')), getNumber('checks', 'rate') !== undefined && getNumber('checks', 'rate') > 0.99 ? 'PASS' : 'FAIL'],
]

const endpointRows = [
	['`GET /health`', formatMs(getNumber('endpoint_health_duration', 'avg')), formatMs(getNumber('endpoint_health_duration', 'p(95)')), formatRate(getNumber('endpoint_health_failed', 'rate')), getNumber('endpoint_health_failed', 'rate') !== undefined && getNumber('endpoint_health_failed', 'rate') < 0.01 ? 'PASS' : 'FAIL'],
	['`GET /contract/pagination?page=1&limit=20`', formatMs(getNumber('endpoint_contract_pagination_duration', 'avg')), formatMs(getNumber('endpoint_contract_pagination_duration', 'p(95)')), formatRate(getNumber('endpoint_contract_pagination_failed', 'rate')), getNumber('endpoint_contract_pagination_failed', 'rate') !== undefined && getNumber('endpoint_contract_pagination_failed', 'rate') < 0.01 ? 'PASS' : 'FAIL'],
	['`GET /metrics`', formatMs(getNumber('endpoint_metrics_duration', 'avg')), formatMs(getNumber('endpoint_metrics_duration', 'p(95)')), formatRate(getNumber('endpoint_metrics_failed', 'rate')), getNumber('endpoint_metrics_failed', 'rate') !== undefined && getNumber('endpoint_metrics_failed', 'rate') < 0.01 ? 'PASS' : 'FAIL'],
]

const thresholdRows = [
	['`http_req_failed`', '`< 1%`', formatRate(getNumber('http_req_failed', 'rate')), getNumber('http_req_failed', 'rate') !== undefined && getNumber('http_req_failed', 'rate') < 0.01 ? 'PASS' : 'FAIL'],
	['`http_req_duration p(95)`', '`< 750ms`', formatMs(getNumber('http_req_duration', 'p(95)')), getNumber('http_req_duration', 'p(95)') !== undefined && getNumber('http_req_duration', 'p(95)') < 750 ? 'PASS' : 'FAIL'],
	['`checks`', '`> 99%`', formatRate(getNumber('checks', 'rate')), getNumber('checks', 'rate') !== undefined && getNumber('checks', 'rate') > 0.99 ? 'PASS' : 'FAIL'],
]

const toTable = (headers, rows) => {
	const headerRow = `| ${headers.join(' | ')} |`
	const dividerRow = `| ${headers.map(() => '---').join(' | ')} |`
	const bodyRows = rows.map((row) => `| ${row.join(' | ')} |`)
	return [headerRow, dividerRow, ...bodyRows].join('\n')
}

const baseUrl = process.env.BENCHMARK_BASE_URL ?? 'http://127.0.0.1:8080'
const targetVus = process.env.BENCHMARK_TARGET_VUS ?? '10'
const steadyState = process.env.BENCHMARK_STEADY_STATE ?? '30s'

const markdown = [
	'<!-- backend-benchmark-comment -->',
	'## Benchmark Result',
	'',
	'### Summary',
	'',
	toTable(['항목', '값', '판정'], summaryRows),
	'',
	'### Endpoint Breakdown',
	'',
	toTable(['Endpoint', 'Avg', 'P95', 'Error Rate', '판정'], endpointRows),
	'',
	'### Threshold Evaluation',
	'',
	toTable(['Threshold', '기준', '실제', '결과'], thresholdRows),
	'',
	'### Notes',
	'',
	`- Benchmark target: \`${baseUrl}\``,
	`- Target VUs: \`${targetVus}\``,
	`- Steady state: \`${steadyState}\``,
	'- Raw artifact: `apps/backend/benchmarks/results/summary.json`',
	'',
].join('\n')

mkdirSync(dirname(resolve(outputPath)), { recursive: true })
writeFileSync(resolve(outputPath), markdown)
