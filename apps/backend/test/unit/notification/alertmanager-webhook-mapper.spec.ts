import { describe, expect, it } from 'vitest';

import { AlertmanagerWebhookMapper } from '../../../src/notification/alertmanager-webhook.mapper';
import { getEmailNotifierConfigFromEnv } from '../../../src/notification/notification.config';

function createMapper(): AlertmanagerWebhookMapper {
	return new AlertmanagerWebhookMapper(getEmailNotifierConfigFromEnv({}));
}

describe('AlertmanagerWebhookMapper', () => {
	it('maps PaymentFailureSpike to payment_failure incident input', () => {
		const mapper = createMapper();

		const result = mapper.mapPayload({
			status: 'firing',
			externalURL: 'http://alertmanager:9093',
			alerts: [{
				status: 'firing',
				labels: {
					alertname: 'PaymentFailureSpike',
					severity: 'critical',
				},
				annotations: {
					summary: 'Payment failures increased',
				},
				startsAt: '2026-04-27T01:00:00.000Z',
				generatorURL: 'http://prometheus:9090/graph?g0.expr=payment',
				fingerprint: 'payment-fp',
			}],
		});

		expect(result.ignored).toBe(0);
		expect(result.incidents).toHaveLength(1);
		expect(result.incidents[0].input.incident).toMatchObject({
			incidentType: 'payment_failure',
			serviceName: 'payment',
			severity: 'critical',
			fingerprint: 'payment-fp',
			source: 'alertmanager',
			generatorUrl: 'http://prometheus:9090/graph?g0.expr=payment',
		});
		expect(result.incidents[0].input.evidence?.observations).toEqual(['Payment failures increased']);
	});

	it('prefers explicit incident_type and service labels for checkout latency', () => {
		const mapper = createMapper();

		const result = mapper.mapPayload({
			alerts: [{
				status: 'firing',
				labels: {
					alertname: 'CheckoutLatencySpike',
					incident_type: 'checkout_latency_spike',
					service: 'checkout',
					severity: 'high',
				},
				startsAt: '2026-04-27T02:00:00.000Z',
				fingerprint: 'checkout-fp',
			}],
		});

		expect(result.ignored).toBe(0);
		expect(result.incidents[0].input.incident).toMatchObject({
			incidentType: 'checkout_latency_spike',
			serviceName: 'checkout',
			severity: 'high',
			fingerprint: 'checkout-fp',
		});
	});

	it('maps APIHighErrorRate to error_burst', () => {
		const mapper = createMapper();

		const result = mapper.mapPayload({
			alerts: [{
				status: 'firing',
				labels: {
					alertname: 'APIHighErrorRate',
					severity: 'critical',
				},
				startsAt: '2026-04-27T03:00:00.000Z',
				fingerprint: 'error-fp',
			}],
		});

		expect(result.ignored).toBe(0);
		expect(result.incidents[0].input.incident).toMatchObject({
			incidentType: 'error_burst',
			serviceName: 'backend',
			fingerprint: 'error-fp',
		});
	});

	it('ignores resolved and unsupported alerts', () => {
		const mapper = createMapper();

		const result = mapper.mapPayload({
			alerts: [
				{
					status: 'resolved',
					labels: {
						alertname: 'PaymentFailureSpike',
					},
				},
				{
					status: 'firing',
					labels: {
						alertname: 'HighCPUUsage',
					},
				},
			],
		});

		expect(result.incidents).toHaveLength(0);
		expect(result.ignored).toBe(2);
	});

	it('derives a stable fallback fingerprint when Alertmanager fingerprint is missing', () => {
		const mapper = createMapper();
		const payload = {
			alerts: [{
				status: 'firing',
				labels: {
					alertname: 'APIHighErrorRate',
					severity: 'critical',
				},
				startsAt: '2026-04-27T04:00:00.000Z',
			}],
		};

		const first = mapper.mapPayload(payload);
		const second = mapper.mapPayload(payload);

		expect(first.incidents[0].input.incident.fingerprint).toBe(second.incidents[0].input.incident.fingerprint);
		expect(first.incidents[0].input.incident.fingerprint).toHaveLength(16);
	});
});
