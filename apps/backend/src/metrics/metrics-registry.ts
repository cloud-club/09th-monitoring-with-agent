import { collectDefaultMetrics, Counter, Registry } from 'prom-client';

type HttpRequestMetricInput = {
	readonly method: string;
	readonly path: string;
	readonly statusCode: number;
	readonly userRole: string;
	readonly requestId: string;
};

const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

const httpRequestsTotal = new Counter({
	name: 'mwa_http_requests_total',
	help: 'Total HTTP requests handled by backend',
	labelNames: ['method', 'path', 'status', 'user_role'],
	registers: [metricsRegistry],
});

export function observeHttpRequest(input: HttpRequestMetricInput): void {
	httpRequestsTotal.inc({
		method: input.method,
		path: input.path,
		status: String(input.statusCode),
		user_role: input.userRole,
	});
}

export const metricsContentType = metricsRegistry.contentType;

export async function getMetricsText(): Promise<string> {
	return metricsRegistry.metrics();
}
