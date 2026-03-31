import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const baseUrl = __ENV.BENCHMARK_BASE_URL ?? 'http://127.0.0.1:8080'
const targetVus = Number(__ENV.BENCHMARK_TARGET_VUS ?? '10')
const rampUp = __ENV.BENCHMARK_RAMP_UP ?? '10s'
const steadyState = __ENV.BENCHMARK_STEADY_STATE ?? '30s'
const rampDown = __ENV.BENCHMARK_RAMP_DOWN ?? '10s'

const healthDuration = new Trend('endpoint_health_duration', true)
const paginationDuration = new Trend('endpoint_contract_pagination_duration', true)
const metricsDuration = new Trend('endpoint_metrics_duration', true)

const healthFailureRate = new Rate('endpoint_health_failed')
const paginationFailureRate = new Rate('endpoint_contract_pagination_failed')
const metricsFailureRate = new Rate('endpoint_metrics_failed')

export const options = {
	scenarios: {
		backend_api: {
			executor: 'ramping-vus',
			startVUs: 1,
			stages: [
				{ duration: rampUp, target: targetVus },
				{ duration: steadyState, target: targetVus },
				{ duration: rampDown, target: 0 },
			],
			gracefulRampDown: '5s',
		},
	},
	thresholds: {
		http_req_failed: ['rate<0.01'],
		http_req_duration: ['p(95)<750'],
		checks: ['rate>0.99'],
		endpoint_health_duration: ['p(95)<300'],
		endpoint_contract_pagination_duration: ['p(95)<750'],
		endpoint_metrics_duration: ['p(95)<750'],
		endpoint_health_failed: ['rate<0.01'],
		endpoint_contract_pagination_failed: ['rate<0.01'],
		endpoint_metrics_failed: ['rate<0.01'],
	},
}

export default function benchmarkBackendApi() {
	const healthResponse = http.get(`${baseUrl}/health`, {
		tags: { endpoint: 'health' },
	})

	check(healthResponse, {
		'health returns 200': (response) => response.status === 200,
		'health returns success payload': (response) => response.json('success') === true,
	})
	healthDuration.add(healthResponse.timings.duration)
	healthFailureRate.add(healthResponse.status !== 200)

	const paginationResponse = http.get(`${baseUrl}/contract/pagination?page=1&limit=20`, {
		tags: { endpoint: 'contract-pagination' },
	})

	check(paginationResponse, {
		'pagination returns 200': (response) => response.status === 200,
		'pagination returns meta': (response) => response.json('meta.pagination.limit') === 20,
	})
	paginationDuration.add(paginationResponse.timings.duration)
	paginationFailureRate.add(paginationResponse.status !== 200)

	const metricsResponse = http.get(`${baseUrl}/metrics`, {
		tags: { endpoint: 'metrics' },
	})

	check(metricsResponse, {
		'metrics returns 200': (response) => response.status === 200,
		'metrics contains request counter': (response) => response.body.includes('mwa_http_requests_total'),
	})
	metricsDuration.add(metricsResponse.timings.duration)
	metricsFailureRate.add(metricsResponse.status !== 200)

	sleep(1)
}
