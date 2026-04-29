import type { EmailDeliveryRecordInput } from '../../../src/notification/email-delivery.repository';
import type {
	DiagnosisResult,
	EmailMessage,
	EmailTransport,
	EmailTransportResult,
	IncidentDrilldownLinks,
	IncidentEvidencePacket,
	IncidentPacket,
	NotifyIncidentInput,
} from '../../../src/notification/notification.types';

import { describe, expect, it, vi } from 'vitest';

import { AlertmanagerNotificationQueueService } from '../../../src/notification/alertmanager-notification-queue.service';
import { AlertmanagerWebhookController } from '../../../src/notification/alertmanager-webhook.controller';
import { AlertmanagerWebhookMapper } from '../../../src/notification/alertmanager-webhook.mapper';
import { EmailDedupService } from '../../../src/notification/email-dedup.service';
import { EmailNotificationPolicyService } from '../../../src/notification/email-notification-policy.service';
import { EmailNotifierService } from '../../../src/notification/email-notifier.service';
import { IncidentDiagnosisService } from '../../../src/notification/incident-diagnosis.service';
import { IncidentEmailRenderer } from '../../../src/notification/incident-email.renderer';
import { getEmailNotifierConfigFromEnv } from '../../../src/notification/notification.config';

class MemoryDeliveryRepository {
	public readonly records: EmailDeliveryRecordInput[] = [];

	public async hasSentRecord(fingerprint: string, dedupKey: string): Promise<boolean> {
		return this.records.some(record => record.incident.fingerprint === fingerprint
			&& record.dedupKey === dedupKey
			&& record.status === 'sent'
			&& !record.dedupSuppressed);
	}

	public async insertRecord(input: EmailDeliveryRecordInput): Promise<void> {
		this.records.push(input);
	}
}

class FakeTransport implements EmailTransport {
	public messages: EmailMessage[] = [];

	public async send(message: EmailMessage): Promise<EmailTransportResult> {
		this.messages.push(message);
		return { accepted: true };
	}
}

class FakeEvidenceCollector {
	public async collect(input: {
		readonly evidence?: IncidentEvidencePacket;
		readonly incident: IncidentPacket;
		readonly links?: IncidentDrilldownLinks;
	}): Promise<{ readonly evidence?: IncidentEvidencePacket; readonly links?: IncidentDrilldownLinks }> {
		return {
			links: input.links,
			evidence: {
				...input.evidence,
				keyMetrics: [{
					name: '결제 완료율',
					query: 'mwa:payment_completion_ratio:5m',
					value: 0.82,
					unit: 'ratio',
					interpretation: '최근 5분 결제 완료율은 82.0%입니다.',
					source: 'prometheus',
				}],
				rootCauseEvidence: [{
					source: 'prometheus',
					description: '최근 5분 결제 완료율은 82.0%입니다.',
					metricName: '결제 완료율',
				}],
			},
		};
	}
}

describe('alertmanager AIOps pipeline', () => {
	it('turns a firing alert event into an LLM-generated incident email report', async () => {
		const config = getEmailNotifierConfigFromEnv({
			AIOPS_LLM_ENABLED: 'true',
			ALERTMANAGER_WEBHOOK_TOKEN: 'secret',
			EMAIL_DEFAULT_RECIPIENTS: 'sre@example.local',
			EMAIL_PAYMENT_RECIPIENTS: 'payment@example.local',
		});
		const renderer = new IncidentEmailRenderer();
		const llmDiagnosis: DiagnosisResult = {
			summary: '결제 실패율이 기준치를 초과했습니다.',
			customerImpact: '일부 사용자가 결제 완료에 실패할 수 있습니다.',
			confirmedEvidence: ['최근 5분 결제 완료율은 82.0%입니다.'],
			likelyCauses: [{
				cause: 'PG 응답 실패 증가',
				confidence: 'medium',
				priority: 1,
				reason: 'Prometheus 결제 완료율 지표가 임계치보다 낮습니다.',
			}],
			immediateActions: ['PG 연동 상태와 payment 로그를 확인합니다.'],
			followupChecks: ['결제 완료율이 90% 이상으로 회복되는지 확인합니다.'],
			incidentTypeKo: '결제 실패율 증가',
			emailSubject: '[CRITICAL] payment - 결제 실패율 증가 / PG 응답 실패 의심',
			finalSeverity: 'critical',
		};
		let llmInput: NotifyIncidentInput | undefined;
		const llmClient = {
			generateDiagnosis: vi.fn(async (input: NotifyIncidentInput) => {
				llmInput = input;
				return llmDiagnosis;
			}),
		};
		const repository = new MemoryDeliveryRepository();
		const transport = new FakeTransport();
		const notifier = new EmailNotifierService(
			config,
			transport,
			new EmailNotificationPolicyService(config),
			new EmailDedupService(config),
			new FakeEvidenceCollector() as never,
			new IncidentDiagnosisService(config, llmClient as never, renderer),
			renderer,
			repository as never,
		);
		const queue = new AlertmanagerNotificationQueueService(config, notifier);
		const controller = new AlertmanagerWebhookController(
			config,
			new AlertmanagerWebhookMapper(config),
			queue,
		);

		const response = controller.receive({
			status: 'firing',
			alerts: [{
				status: 'firing',
				labels: {
					alertname: 'PaymentFailureSpike',
					severity: 'critical',
					service: 'payment',
					incident_type: 'payment_failure',
				},
				annotations: {
					summary: 'Payment completion ratio is below threshold',
				},
				startsAt: '2026-04-28T01:00:00.000Z',
				generatorURL: 'https://prometheus.example/graph?g0.expr=payment',
				fingerprint: 'payment-alert-fp',
			}],
		}, 'Bearer secret');

		expect(response).toEqual({
			accepted: 1,
			ignored: 0,
			queued: 1,
		});

		await vi.waitFor(() => {
			expect(llmClient.generateDiagnosis).toHaveBeenCalledTimes(1);
			expect(transport.messages).toHaveLength(1);
		});
		expect(llmInput).toBeDefined();
		expect(llmInput?.incident).toMatchObject({
			incidentType: 'payment_failure',
			fingerprint: 'payment-alert-fp',
			source: 'alertmanager',
		});
		expect(transport.messages[0].subject).toBe('[CRITICAL] payment - 결제 실패율 증가 / PG 응답 실패 의심');
		expect(transport.messages[0].text).toContain('1. 요약');
		expect(transport.messages[0].text).toContain('PG 응답 실패 증가');
		expect(repository.records[0]).toMatchObject({
			status: 'sent',
			llmUsed: true,
			fallbackUsed: false,
		});
	});
});
