import type { EmailNotifierConfig } from './notification.config';

import type { DiagnosisResult, IncidentPacket, IncidentSeverity } from './notification.types';
import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_NOTIFIER_CONFIG } from './notification.tokens';

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
	info: 0,
	low: 0,
	warning: 1,
	medium: 1,
	high: 2,
	critical: 3,
};

export type NotificationPolicyDecision = {
	readonly shouldSend: boolean;
	readonly reason?: string;
	readonly effectiveSeverity: IncidentSeverity;
};

@Injectable()
export class EmailNotificationPolicyService {
	public constructor(
		@Inject(EMAIL_NOTIFIER_CONFIG)
		private readonly config: EmailNotifierConfig,
	) {}

	public evaluate(incident: IncidentPacket, diagnosis?: DiagnosisResult): NotificationPolicyDecision {
		const effectiveSeverity = diagnosis?.finalSeverity ?? incident.severity;
		if (SEVERITY_RANK[effectiveSeverity] < SEVERITY_RANK[this.config.minSeverity]) {
			return {
				shouldSend: false,
				reason: `severity ${effectiveSeverity} is below email threshold ${this.config.minSeverity}`,
				effectiveSeverity,
			};
		}

		if (this.config.allowedIncidentTypes.length > 0 && !this.config.allowedIncidentTypes.includes(incident.incidentType)) {
			return {
				shouldSend: false,
				reason: `incident type ${incident.incidentType} is not enabled for email notifier`,
				effectiveSeverity,
			};
		}

		return { shouldSend: true, effectiveSeverity };
	}
}
