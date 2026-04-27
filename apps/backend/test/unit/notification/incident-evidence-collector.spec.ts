import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	IncidentEvidenceCollector,
	LokiEvidenceClient,
	PrometheusEvidenceClient,
	TempoEvidenceClient,
} from '../../../src/notification/incident-evidence.collector';
import { getEmailNotifierConfigFromEnv } from '../../../src/notification/notification.config';

function prometheusPayload(value: number): unknown {
	return {
		data: {
			result: [{ value: [1777220000, String(value)] }],
		},
		status: 'success',
	};
}

function lokiPayload(): unknown {
	return {
		data: {
			result: [{
				values: [[
					'1777220000000000000',
					'timestamp=2026-04-27 trace=0123456789abcdef0123456789abcdef endpoint=/api/orders/1/payment-attempts status=504 error=PG_TIMEOUT message=PG timeout',
				]],
			}],
		},
		status: 'success',
	};
}

function tempoPayload(): unknown {
	return {
		batches: [{
			scopeSpans: [{
				spans: [
					{ name: 'payment-provider-call', durationNano: '2900000000', attributes: [{ key: 'error', value: { boolValue: true } }] },
					{ name: 'order-create', durationNano: '120000000' },
				],
			}],
		}],
	};
}

function createCollector(env: Record<string, string | undefined> = {}): IncidentEvidenceCollector {
	const config = getEmailNotifierConfigFromEnv({
		AIOPS_EVIDENCE_COLLECTION_ENABLED: 'true',
		AIOPS_EVIDENCE_TIMEOUT_MS: '1000',
		...env,
	});

	return new IncidentEvidenceCollector(
		config,
		new PrometheusEvidenceClient(config),
		new LokiEvidenceClient(config),
		new TempoEvidenceClient(config),
	);
}

describe('incident evidence collector', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('collects Prometheus key metrics and Loki/Tempo root cause evidence', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/api/v1/query?')) {
				return new Response(JSON.stringify(prometheusPayload(url.includes('payment_completion') ? 0.812 : 2.9)), { status: 200 });
			}

			if (url.includes('/loki/api/v1/query_range')) {
				return new Response(JSON.stringify(lokiPayload()), { status: 200 });
			}

			if (url.includes('/api/traces/')) {
				return new Response(JSON.stringify(tempoPayload()), { status: 200 });
			}

			return new Response('{}', { status: 404 });
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await createCollector().collect({
			incident: {
				incidentId: 'inc-payment-1',
				incidentType: 'payment_failure',
				severity: 'high',
				serviceName: 'payment',
				detectedAt: '2026-04-27T00:00:00.000Z',
				fingerprint: 'fp-payment',
				source: 'test',
			},
		});

		expect(result.evidence?.keyMetrics?.some(metric => metric.name === '결제 완료율')).toBe(true);
		expect(result.evidence?.representativeMetricSummary).toContain('결제 완료율');
		expect(result.evidence?.rootCauseEvidence?.some(entry => entry.source === 'loki')).toBe(true);
		expect(result.evidence?.rootCauseEvidence?.some(entry => entry.source === 'tempo')).toBe(true);
		expect(result.links?.lokiQueryUrl).toContain('/loki/api/v1/query_range');
		expect(result.links?.tempoTraceUrl).toContain('/api/traces/0123456789abcdef0123456789abcdef');
	});

	it('keeps partial evidence when one telemetry source fails', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/api/v1/query?')) {
				return new Response(JSON.stringify(prometheusPayload(0.04)), { status: 200 });
			}

			if (url.includes('/loki/api/v1/query_range')) {
				return new Response('loki down', { status: 500 });
			}

			return new Response('{}', { status: 404 });
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await createCollector().collect({
			incident: {
				incidentId: 'inc-error-1',
				incidentType: 'error_burst',
				severity: 'high',
				serviceName: 'backend',
				detectedAt: '2026-04-27T00:00:00.000Z',
				fingerprint: 'fp-error',
				source: 'test',
			},
		});

		expect(result.evidence?.keyMetrics?.length).toBeGreaterThan(0);
		expect(result.evidence?.unavailableSources).toContain('Loki');
		expect(result.evidence?.unavailableSources).toContain('Tempo');
		expect(result.evidence?.collectionWarnings?.join('\n')).toContain('Loki evidence collection failed');
	});
});
