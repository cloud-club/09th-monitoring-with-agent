import type { EmailNotifierConfig } from './notification.config';

import type { IncidentPacket } from './notification.types';
import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_NOTIFIER_CONFIG } from './notification.tokens';

export type EmailDedupDecision = {
	readonly dedupKey: string;
	readonly bucketStartMs: number;
};

@Injectable()
export class EmailDedupService {
	public constructor(
		@Inject(EMAIL_NOTIFIER_CONFIG)
		private readonly config: EmailNotifierConfig,
	) {}

	public createDedupDecision(incident: IncidentPacket): EmailDedupDecision {
		const detectedAt = incident.detectedAt instanceof Date ? incident.detectedAt : new Date(incident.detectedAt);
		const eventTimeMs = Number.isFinite(detectedAt.getTime()) ? detectedAt.getTime() : Date.now();
		const windowMs = Math.max(this.config.dedupWindowMinutes, 1) * 60 * 1000;
		const bucketStartMs = Math.floor(eventTimeMs / windowMs) * windowMs;

		return {
			bucketStartMs,
			dedupKey: [
				incident.fingerprint,
				incident.incidentType,
				incident.serviceName,
				incident.severity,
				new Date(bucketStartMs).toISOString(),
			].join(':'),
		};
	}
}
