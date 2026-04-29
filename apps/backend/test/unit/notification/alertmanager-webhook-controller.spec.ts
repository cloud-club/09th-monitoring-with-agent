import type { NotifyIncidentInput } from '../../../src/notification/notification.types';

import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AlertmanagerWebhookController } from '../../../src/notification/alertmanager-webhook.controller';
import { getEmailNotifierConfigFromEnv } from '../../../src/notification/notification.config';

const incidentInput: NotifyIncidentInput = {
	incident: {
		incidentId: 'alertmanager:APIHighErrorRate:error-fp:2026-04-27T01:00:00.000Z',
		incidentType: 'error_burst',
		severity: 'critical',
		serviceName: 'backend',
		detectedAt: '2026-04-27T01:00:00.000Z',
		fingerprint: 'error-fp',
		source: 'alertmanager',
		generatorUrl: 'http://prometheus:9090/graph',
	},
	links: {
		alertSourceUrl: 'http://prometheus:9090/graph',
	},
};

describe('AlertmanagerWebhookController', () => {
	let controller: AlertmanagerWebhookController;
	let queue: { enqueue: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		queue = {
			enqueue: vi.fn(() => true),
		};
		const mapper = {
			mapPayload: vi.fn(() => ({
				incidents: [{ alertName: 'APIHighErrorRate', input: incidentInput }],
				ignored: 0,
			})),
		};

		controller = new AlertmanagerWebhookController(
			getEmailNotifierConfigFromEnv({
				ALERTMANAGER_WEBHOOK_TOKEN: 'secret',
			}),
			mapper as never,
			queue as never,
		);
	});

	it('returns 202 and queues mapped firing incidents without waiting for email delivery', () => {
		const response = controller.receive({ alerts: [] }, 'Bearer secret');

		expect(response).toEqual({
			accepted: 1,
			ignored: 0,
			queued: 1,
		});
		expect(queue.enqueue).toHaveBeenCalledWith(incidentInput);
	});

	it('returns 401 when webhook token is missing or invalid', () => {
		expect(() => controller.receive({ alerts: [] }, undefined)).toThrow(UnauthorizedException);
		expect(queue.enqueue).not.toHaveBeenCalled();
	});
});
