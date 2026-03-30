import { collectDefaultMetrics, Counter, Registry } from 'prom-client';

const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

const httpRequestsTotal = new Counter({
	name: 'mwa_http_requests_total',
	help: 'Total HTTP requests handled by backend',
	labelNames: ['method', 'path', 'status'],
	registers: [metricsRegistry],
});

export function observeHttpRequest(method: string, path: string, statusCode: number): void {
	httpRequestsTotal.inc({
		method,
		path,
		status: String(statusCode),
	});
}

export const metricsContentType = metricsRegistry.contentType;

export async function getMetricsText(): Promise<string> {
	return metricsRegistry.metrics();
}
