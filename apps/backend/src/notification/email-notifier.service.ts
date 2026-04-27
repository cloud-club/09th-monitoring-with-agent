import type { EmailNotifierConfig } from './notification.config';

import type { EmailDeliveryResult, EmailTransport, NotifyIncidentInput } from './notification.types';

import { Inject, Injectable } from '@nestjs/common';
import {
	incrementEmailDedupSuppressed,
	incrementEmailFallback,
	incrementEmailRender,
	incrementEmailSend,
	incrementLlmDiagnosis,
	observeIncidentToEmailLatency,
} from '../metrics/metrics-registry';
import { EmailDedupService } from './email-dedup.service';
import { EmailDeliveryRepository } from './email-delivery.repository';
import { EmailNotificationPolicyService } from './email-notification-policy.service';
import { IncidentDiagnosisService } from './incident-diagnosis.service';
import { IncidentEmailRenderer } from './incident-email.renderer';
import { IncidentEvidenceCollector } from './incident-evidence.collector';
import { EMAIL_NOTIFIER_CONFIG, EMAIL_TRANSPORT } from './notification.tokens';

function uniqueRecipients(recipients: readonly string[]): readonly string[] {
	return [...new Set(recipients.map(recipient => recipient.trim()).filter(recipient => recipient.length > 0))];
}

@Injectable()
export class EmailNotifierService {
	public constructor(
		@Inject(EMAIL_NOTIFIER_CONFIG)
		private readonly config: EmailNotifierConfig,
		@Inject(EMAIL_TRANSPORT)
		private readonly transport: EmailTransport,
		private readonly policyService: EmailNotificationPolicyService,
		private readonly dedupService: EmailDedupService,
		private readonly evidenceCollector: IncidentEvidenceCollector,
		private readonly diagnosisService: IncidentDiagnosisService,
		private readonly renderer: IncidentEmailRenderer,
		private readonly deliveryRepository: EmailDeliveryRepository,
	) {}

	public async notifyIncident(input: NotifyIncidentInput): Promise<EmailDeliveryResult> {
		const startedAt = Date.now();
		const initialPolicy = this.policyService.evaluate(input.incident, input.diagnosis);
		const dedup = this.dedupService.createDedupDecision(input.incident);
		const recipients = this.resolveRecipients(input.incident.incidentType, input.incident.serviceName);

		if (!initialPolicy.shouldSend) {
			await this.deliveryRepository.insertRecord({
				incident: input.incident,
				dedupKey: dedup.dedupKey,
				severity: initialPolicy.effectiveSeverity,
				recipients,
				status: 'suppressed',
				failureReason: initialPolicy.reason,
				dedupSuppressed: false,
				llmUsed: false,
				fallbackUsed: false,
			});

			return {
				status: 'suppressed',
				incidentId: input.incident.incidentId,
				fingerprint: input.incident.fingerprint,
				dedupKey: dedup.dedupKey,
				recipients,
				reason: initialPolicy.reason,
				dedupSuppressed: false,
				llmUsed: false,
				fallbackUsed: false,
			};
		}

		if (await this.deliveryRepository.hasSentRecord(input.incident.fingerprint, dedup.dedupKey)) {
			incrementEmailDedupSuppressed();
			await this.deliveryRepository.insertRecord({
				incident: input.incident,
				dedupKey: dedup.dedupKey,
				severity: initialPolicy.effectiveSeverity,
				recipients,
				status: 'suppressed',
				failureReason: 'dedup suppressed',
				dedupSuppressed: true,
				llmUsed: false,
				fallbackUsed: false,
			});

			return {
				status: 'suppressed',
				incidentId: input.incident.incidentId,
				fingerprint: input.incident.fingerprint,
				dedupKey: dedup.dedupKey,
				recipients,
				reason: 'dedup suppressed',
				dedupSuppressed: true,
				llmUsed: false,
				fallbackUsed: false,
			};
		}

		const enrichedInput = await this.evidenceCollector.collect(input);
		const diagnosisInput = {
			...input,
			evidence: enrichedInput.evidence,
			links: enrichedInput.links,
		};

		const diagnosis = await this.diagnosisService.resolveDiagnosis(diagnosisInput);
		incrementLlmDiagnosis(diagnosis.llmUsed ? 'success' : diagnosis.fallbackUsed ? 'fallback' : 'skipped');
		if (diagnosis.fallbackUsed) {
			incrementEmailFallback();
		}

		const finalPolicy = this.policyService.evaluate(input.incident, diagnosis.diagnosis);
		if (!finalPolicy.shouldSend) {
			await this.deliveryRepository.insertRecord({
				incident: input.incident,
				dedupKey: dedup.dedupKey,
				severity: finalPolicy.effectiveSeverity,
				recipients,
				status: 'suppressed',
				failureReason: finalPolicy.reason,
				dedupSuppressed: false,
				llmUsed: diagnosis.llmUsed,
				fallbackUsed: diagnosis.fallbackUsed,
			});

			return {
				status: 'suppressed',
				incidentId: input.incident.incidentId,
				fingerprint: input.incident.fingerprint,
				dedupKey: dedup.dedupKey,
				recipients,
				reason: finalPolicy.reason,
				dedupSuppressed: false,
				llmUsed: diagnosis.llmUsed,
				fallbackUsed: diagnosis.fallbackUsed,
			};
		}

		let report;
		try {
			report = this.renderer.render({
				incident: input.incident,
				diagnosis: diagnosis.diagnosis,
				links: diagnosisInput.links,
				evidence: diagnosisInput.evidence,
				fallbackUsed: diagnosis.fallbackUsed,
			});
			incrementEmailRender('success');
		}
		catch {
			incrementEmailRender('failure');
			const fallbackDiagnosis = this.renderer.createFallbackDiagnosis(input.incident, diagnosisInput.evidence);
			report = this.renderer.render({
				incident: input.incident,
				diagnosis: fallbackDiagnosis,
				links: diagnosisInput.links,
				evidence: diagnosisInput.evidence,
				fallbackUsed: true,
			});
		}

		const sendResult = await this.transport.send({
			from: this.config.smtp.from,
			to: recipients,
			subject: report.subject,
			text: report.textBody,
			html: report.htmlBody,
		});

		const sentAt = sendResult.accepted ? new Date() : undefined;
		const status = sendResult.accepted ? 'sent' : 'failed';
		incrementEmailSend(sendResult.accepted ? 'success' : 'failure');
		observeIncidentToEmailLatency((Date.now() - startedAt) / 1000);

		await this.deliveryRepository.insertRecord({
			incident: input.incident,
			dedupKey: dedup.dedupKey,
			severity: finalPolicy.effectiveSeverity,
			subject: report.subject,
			recipients,
			status,
			failureReason: sendResult.failureReason ?? diagnosis.failureReason,
			dedupSuppressed: false,
			llmUsed: diagnosis.llmUsed,
			fallbackUsed: report.fallbackUsed,
			sentAt,
		});

		return {
			status,
			incidentId: input.incident.incidentId,
			fingerprint: input.incident.fingerprint,
			dedupKey: dedup.dedupKey,
			recipients,
			subject: report.subject,
			reason: sendResult.failureReason ?? diagnosis.failureReason,
			dedupSuppressed: false,
			llmUsed: diagnosis.llmUsed,
			fallbackUsed: report.fallbackUsed,
			sentAt,
		};
	}

	private resolveRecipients(incidentType: string, serviceName: string): readonly string[] {
		const normalizedIncidentType = incidentType.toLowerCase();
		const normalizedServiceName = serviceName.toLowerCase();
		const routedRecipients = [
			...this.config.defaultRecipients,
			...(normalizedIncidentType.includes('payment') || normalizedServiceName.includes('payment') ? this.config.paymentRecipients : []),
			...(normalizedIncidentType.includes('checkout') || normalizedServiceName.includes('checkout') ? this.config.checkoutRecipients : []),
			...(normalizedIncidentType.includes('infra') || normalizedServiceName.includes('infra') ? this.config.infraRecipients : []),
		];

		const recipients = uniqueRecipients(routedRecipients);
		return recipients.length === 0 ? this.config.defaultRecipients : recipients;
	}
}
