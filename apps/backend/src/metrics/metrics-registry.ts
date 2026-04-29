import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

type HttpRequestMetricInput = {
	readonly method: string;
	readonly handler: string;
	readonly statusCode: number;
	readonly durationSeconds: number;
};

type PaymentProcessingLatencyInput = {
	readonly outcome: 'failed' | 'success';
	readonly durationSeconds: number;
};

type EmailMetricResult = 'failure' | 'success';
type LlmDiagnosisResult = 'fallback' | 'skipped' | 'success';
type AlertmanagerWebhookResult = 'accepted' | 'ignored' | 'rejected';
type AlertmanagerQueueResult = 'dropped' | 'enqueued' | 'failed' | 'processed';

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

const logHeartbeatUnixtimeSeconds = new Gauge({
	name: 'mwa_log_heartbeat_unixtime_seconds',
	help: 'Latest unix timestamp for backend structured log heartbeat activity',
	labelNames: ['service'],
	registers: [metricsRegistry],
});

const paymentProcessingLatencySeconds = new Histogram({
	name: 'mwa_payment_processing_latency_seconds',
	help: 'Latency in seconds for backend payment attempt processing',
	labelNames: ['outcome'],
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
	registers: [metricsRegistry],
});

const emailRenderTotal = new Counter({
	name: 'mwa_email_render_total',
	help: 'Total incident email render attempts by result',
	labelNames: ['result'],
	registers: [metricsRegistry],
});

const emailSendTotal = new Counter({
	name: 'mwa_email_send_total',
	help: 'Total incident email send attempts by result',
	labelNames: ['result'],
	registers: [metricsRegistry],
});

const emailDedupSuppressedTotal = new Counter({
	name: 'mwa_email_dedup_suppressed_total',
	help: 'Total incident emails suppressed by dedup policy',
	registers: [metricsRegistry],
});

const emailFallbackTotal = new Counter({
	name: 'mwa_email_fallback_total',
	help: 'Total fallback incident email reports generated',
	registers: [metricsRegistry],
});

const llmDiagnosisTotal = new Counter({
	name: 'mwa_aiops_llm_diagnosis_total',
	help: 'Total local LLM diagnosis outcomes by result',
	labelNames: ['result'],
	registers: [metricsRegistry],
});

const incidentToEmailLatencySeconds = new Histogram({
	name: 'mwa_incident_to_email_latency_seconds',
	help: 'Latency in seconds from incident notification request to email delivery result',
	buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
	registers: [metricsRegistry],
});

const alertmanagerWebhookTotal = new Counter({
	name: 'mwa_alertmanager_webhook_total',
	help: 'Total Alertmanager webhook requests by result',
	labelNames: ['result'],
	registers: [metricsRegistry],
});

const alertmanagerQueueTotal = new Counter({
	name: 'mwa_alertmanager_queue_total',
	help: 'Total Alertmanager incident queue events by result',
	labelNames: ['result'],
	registers: [metricsRegistry],
});

export function refreshLogHeartbeatMetric(timestampMs: number = Date.now()): void {
	logHeartbeatUnixtimeSeconds.set({ service: BACKEND_SERVICE }, timestampMs / 1000);
}

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

export function observePaymentProcessingLatency(input: PaymentProcessingLatencyInput): void {
	paymentProcessingLatencySeconds.observe(
		{
			outcome: input.outcome,
		},
		input.durationSeconds,
	);
}

export function incrementEmailRender(result: EmailMetricResult): void {
	emailRenderTotal.inc({ result });
}

export function incrementEmailSend(result: EmailMetricResult): void {
	emailSendTotal.inc({ result });
}

export function incrementEmailDedupSuppressed(): void {
	emailDedupSuppressedTotal.inc();
}

export function incrementEmailFallback(): void {
	emailFallbackTotal.inc();
}

export function incrementLlmDiagnosis(result: LlmDiagnosisResult): void {
	llmDiagnosisTotal.inc({ result });
}

export function observeIncidentToEmailLatency(durationSeconds: number): void {
	incidentToEmailLatencySeconds.observe(durationSeconds);
}

export function incrementAlertmanagerWebhook(result: AlertmanagerWebhookResult): void {
	alertmanagerWebhookTotal.inc({ result });
}

export function incrementAlertmanagerQueue(result: AlertmanagerQueueResult): void {
	alertmanagerQueueTotal.inc({ result });
}

export const metricsContentType = metricsRegistry.contentType;

export async function getMetricsText(): Promise<string> {
	return metricsRegistry.metrics();
}
