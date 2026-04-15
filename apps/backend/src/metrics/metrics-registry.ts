import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

type HttpRequestMetricInput = {
	readonly method: string;
	readonly handler: string;
	readonly statusCode: number;
	readonly durationSeconds: number;
};

type SearchRequestResult = 'success' | 'validation_error' | 'zero_result';
type CartAddResult = 'success' | 'validation_error' | 'conflict';
type OrderCreateResult = 'success' | 'conflict' | 'error';
type PaymentAttemptResult = 'started' | 'succeeded' | 'failed' | 'validation_error';

const metricsRegistry = new Registry();
const BACKEND_SERVICE = 'backend';

collectDefaultMetrics({ register: metricsRegistry });

const httpRequestsTotal = new Counter({
	name: 'mwa_http_requests_total',
	help: 'Total HTTP requests handled by backend',
	labelNames: ['service', 'handler', 'method', 'status_code'],
	registers: [metricsRegistry],
});

const httpRequestDurationSeconds = new Histogram({
	name: 'mwa_http_request_duration_seconds',
	help: 'HTTP request duration in seconds for backend handlers',
	labelNames: ['service', 'handler', 'method'],
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
	registers: [metricsRegistry],
});

const searchRequestsTotal = new Counter({
	name: 'mwa_search_requests_total',
	help: 'Total search requests by result',
	labelNames: ['result'],
	registers: [metricsRegistry],
});

const cartAddTotal = new Counter({
	name: 'mwa_cart_add_total',
	help: 'Total cart add requests by result',
	labelNames: ['result'],
	registers: [metricsRegistry],
});

const orderCreateTotal = new Counter({
	name: 'mwa_order_create_total',
	help: 'Total order creation requests by result',
	labelNames: ['result'],
	registers: [metricsRegistry],
});

const paymentAttemptTotal = new Counter({
	name: 'mwa_payment_attempt_total',
	help: 'Total payment attempt requests by result',
	labelNames: ['result'],
	registers: [metricsRegistry],
});

export function observeHttpRequest(input: HttpRequestMetricInput): void {
	httpRequestsTotal.inc({
		service: BACKEND_SERVICE,
		handler: input.handler,
		method: input.method,
		status_code: String(input.statusCode),
	});

	httpRequestDurationSeconds.observe(
		{
			service: BACKEND_SERVICE,
			handler: input.handler,
			method: input.method,
		},
		input.durationSeconds,
	);
}

export function incrementSearchRequest(result: SearchRequestResult): void {
	searchRequestsTotal.inc({ result });
}

export function incrementCartAdd(result: CartAddResult): void {
	cartAddTotal.inc({ result });
}

export function incrementOrderCreate(result: OrderCreateResult): void {
	orderCreateTotal.inc({ result });
}

export function incrementPaymentAttempt(result: PaymentAttemptResult): void {
	paymentAttemptTotal.inc({ result });
}

export const metricsContentType = metricsRegistry.contentType;

export async function getMetricsText(): Promise<string> {
	return metricsRegistry.metrics();
}
