import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';

import { EmailDedupService } from './email-dedup.service';
import { EmailDeliveryRepository } from './email-delivery.repository';
import { EmailNotificationPolicyService } from './email-notification-policy.service';
import { EmailNotifierService } from './email-notifier.service';
import { IncidentDiagnosisService } from './incident-diagnosis.service';
import { IncidentEmailRenderer } from './incident-email.renderer';
import {
	IncidentEvidenceCollector,
	LokiEvidenceClient,
	PrometheusEvidenceClient,
	TempoEvidenceClient,
} from './incident-evidence.collector';
import { LocalLlmDiagnosisClient } from './local-llm-diagnosis.client';
import { NoopEmailTransport } from './noop-email.transport';
import { getEmailNotifierConfigFromEnv } from './notification.config';
import { EMAIL_NOTIFIER_CONFIG, EMAIL_TRANSPORT } from './notification.tokens';
import { SmtpEmailTransport } from './smtp-email.transport';

@Module({
	imports: [DatabaseModule],
	providers: [
		{
			provide: EMAIL_NOTIFIER_CONFIG,
			useFactory: getEmailNotifierConfigFromEnv,
		},
		{
			provide: EMAIL_TRANSPORT,
			useFactory: (config: ReturnType<typeof getEmailNotifierConfigFromEnv>) => {
				return config.enabled ? new SmtpEmailTransport(config.smtp) : new NoopEmailTransport();
			},
			inject: [EMAIL_NOTIFIER_CONFIG],
		},
		EmailDedupService,
		EmailDeliveryRepository,
		EmailNotificationPolicyService,
		EmailNotifierService,
		IncidentEvidenceCollector,
		IncidentDiagnosisService,
		IncidentEmailRenderer,
		LokiEvidenceClient,
		LocalLlmDiagnosisClient,
		PrometheusEvidenceClient,
		TempoEvidenceClient,
	],
	exports: [EmailNotifierService],
})
export class EmailNotifierModule {}
