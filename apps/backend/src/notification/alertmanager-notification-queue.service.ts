import type { EmailNotifierConfig } from './notification.config';
import type { NotifyIncidentInput } from './notification.types';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { incrementAlertmanagerQueue } from '../metrics/metrics-registry';

import { EmailNotifierService } from './email-notifier.service';
import { EMAIL_NOTIFIER_CONFIG } from './notification.tokens';

@Injectable()
export class AlertmanagerNotificationQueueService {
	private readonly logger = new Logger(AlertmanagerNotificationQueueService.name);
	private pending = 0;
	private tail: Promise<void> = Promise.resolve();

	public constructor(
		@Inject(EMAIL_NOTIFIER_CONFIG)
		private readonly config: EmailNotifierConfig,
		private readonly notifier: EmailNotifierService,
	) {}

	public enqueue(input: NotifyIncidentInput): boolean {
		if (this.pending >= this.config.alertmanager.queueMaxSize) {
			incrementAlertmanagerQueue('dropped');
			this.logger.warn(`Alertmanager notification queue is full; dropped incident ${input.incident.incidentId}`);
			return false;
		}

		this.pending += 1;
		incrementAlertmanagerQueue('enqueued');
		this.tail = this.tail.then(
			async () => {
				await this.process(input);
			},
			async () => {
				await this.process(input);
			},
		);
		return true;
	}

	private async process(input: NotifyIncidentInput): Promise<void> {
		try {
			await this.notifier.notifyIncident(input);
			incrementAlertmanagerQueue('processed');
		}
		catch (error) {
			incrementAlertmanagerQueue('failed');
			this.logger.error(
				`Alertmanager incident processing failed for ${input.incident.incidentId}`,
				error instanceof Error ? error.stack : undefined,
			);
		}
		finally {
			this.pending -= 1;
		}
	}
}
