import type { AlertmanagerWebhookResponse } from './alertmanager-webhook.types';
import type { EmailNotifierConfig } from './notification.config';

import { Body, Controller, Headers, HttpCode, Inject, Logger, Post, UnauthorizedException } from '@nestjs/common';

import { incrementAlertmanagerWebhook } from '../metrics/metrics-registry';

import { AlertmanagerNotificationQueueService } from './alertmanager-notification-queue.service';
import { AlertmanagerWebhookMapper } from './alertmanager-webhook.mapper';
import { EMAIL_NOTIFIER_CONFIG } from './notification.tokens';

@Controller('/internal/alertmanager')
export class AlertmanagerWebhookController {
	private readonly logger = new Logger(AlertmanagerWebhookController.name);

	public constructor(
		@Inject(EMAIL_NOTIFIER_CONFIG)
		private readonly config: EmailNotifierConfig,
		private readonly mapper: AlertmanagerWebhookMapper,
		private readonly queue: AlertmanagerNotificationQueueService,
	) {}

	@Post('/webhook')
	@HttpCode(202)
	public receive(
		@Body() payload: unknown,
		@Headers('authorization') authorization?: string,
	): AlertmanagerWebhookResponse {
		if (this.config.alertmanager.webhookToken !== undefined && authorization !== `Bearer ${this.config.alertmanager.webhookToken}`) {
			incrementAlertmanagerWebhook('rejected');
			throw new UnauthorizedException('Invalid Alertmanager webhook token');
		}

		const mapped = this.mapper.mapPayload(payload);
		let queued = 0;
		let dropped = 0;

		for (const incident of mapped.incidents) {
			if (this.queue.enqueue(incident.input)) {
				queued += 1;
			}
			else {
				dropped += 1;
			}
		}

		const ignored = mapped.ignored + dropped;
		if (ignored > 0) {
			this.logger.log(`Alertmanager webhook ignored ${ignored} alert(s)`);
		}

		incrementAlertmanagerWebhook(queued > 0 ? 'accepted' : 'ignored');
		return {
			accepted: queued,
			ignored,
			queued,
		};
	}
}
