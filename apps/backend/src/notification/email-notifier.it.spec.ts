import type { EmailDeliveryRecordInput } from './email-delivery.repository';

import type {
	EmailMessage,
	EmailTransport,
	EmailTransportResult,
	IncidentDrilldownLinks,
	IncidentEvidencePacket,
	IncidentPacket,
} from './notification.types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getMetricsText } from '../metrics/metrics-registry';

import { EmailDedupService } from './email-dedup.service';
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
import { getEmailNotifierConfigFromEnv } from './notification.config';

class MemoryDeliveryRepository {
	public readonly records: EmailDeliveryRecordInput[] = [];

	public async hasSentRecord(fingerprint: string, dedupKey: string): Promise<boolean> {
		return this.records.some((record) => {
			return record.incident.fingerprint === fingerprint
				&& record.dedupKey === dedupKey
				&& record.status === 'sent'
				&& !record.dedupSuppressed;
		});
	}

	public async insertRecord(input: EmailDeliveryRecordInput): Promise<void> {
		this.records.push(input);
	}
}

class FakeTransport implements EmailTransport {
	public messages: EmailMessage[] = [];

	public constructor(private readonly result: EmailTransportResult = { accepted: true }) {}

	public async send(message: EmailMessage): Promise<EmailTransportResult> {
		this.messages.push(message);
		return this.result;
	}
}

type EvidenceCollectorLike = {
	collect: (input: { readonly evidence?: IncidentEvidencePacket; readonly incident: IncidentPacket; readonly links?: IncidentDrilldownLinks }) => Promise<{ readonly evidence?: IncidentEvidencePacket; readonly links?: IncidentDrilldownLinks }>;
};

class FakeEvidenceCollector implements EvidenceCollectorLike {
	public calls = 0;

	public constructor(private readonly evidence?: IncidentEvidencePacket) {}

	public async collect(input: { readonly evidence?: IncidentEvidencePacket; readonly links?: IncidentDrilldownLinks }): Promise<{ readonly evidence?: IncidentEvidencePacket; readonly links?: IncidentDrilldownLinks }> {
		this.calls += 1;
		return {
			evidence: {
				...input.evidence,
				...this.evidence,
			},
			links: input.links,
		};
	}
}

const incident: IncidentPacket = {
	incidentId: 'inc-error-1',
	incidentType: 'error_burst',
	severity: 'high',
	serviceName: 'backend',
	detectedAt: '2026-04-27T01:00:00.000Z',
	fingerprint: 'fp-error',
	source: 'test',
};

function createService(
	repository: MemoryDeliveryRepository,
	transport: EmailTransport,
	env: Record<string, string | undefined> = {},
	evidenceCollector: EvidenceCollectorLike = new FakeEvidenceCollector(),
): EmailNotifierService {
	const config = getEmailNotifierConfigFromEnv({
		EMAIL_DEFAULT_RECIPIENTS: 'sre@example.local,backend@example.local',
		AIOPS_LLM_ENABLED: 'false',
		...env,
	});
	const renderer = new IncidentEmailRenderer();
	const diagnosis = new IncidentDiagnosisService(
		config,
		new LocalLlmDiagnosisClient(config),
		renderer,
	);

	return new EmailNotifierService(
		config,
		transport,
		new EmailNotificationPolicyService(config),
		new EmailDedupService(config),
		evidenceCollector as never,
		diagnosis,
		renderer,
		repository as never,
	);
}

describe('email notifier integration behavior', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('sends provided diagnosis with the operator incident report format', async () => {
		const repository = new MemoryDeliveryRepository();
		const transport = new FakeTransport();
		const service = createService(repository, transport);

		const result = await service.notifyIncident({
			incident: {
				...incident,
				incidentId: 'inc-payment-format',
				incidentType: 'payment_failure',
				serviceName: 'payment',
				fingerprint: 'fp-payment-format',
			},
			diagnosis: {
				summary: '결제 성공률이 하락했습니다.',
				customerImpact: '일부 사용자가 결제 완료 실패를 경험했을 수 있습니다.',
				confirmedEvidence: ['결제 성공률 81.2% 관찰'],
				likelyCauses: [{ cause: 'PG 인증 API 지연', confidence: 'high', reason: 'Loki 로그와 latency 지표가 같은 외부 호출을 지목합니다.' }],
				immediateActions: ['PG 상태 페이지를 확인합니다.'],
				followupChecks: ['최근 payment 배포 여부를 확인합니다.'],
				incidentTypeKo: '결제 실패율 증가',
				emailSubject: '[HIGH] payment - 결제 실패율 증가 / PG 연동 타임아웃 의심',
				finalSeverity: 'high',
			},
		});

		expect(result.status).toBe('sent');
		expect(result.fallbackUsed).toBe(false);
		expect(transport.messages[0].subject).toBe('[HIGH] payment - 결제 실패율 증가 / PG 연동 타임아웃 의심');
		expect(transport.messages[0].text).toContain('1. 요약');
		expect(transport.messages[0].text).toContain('4. 핵심 지표');
		expect(transport.messages[0].text).toContain('9. 비고');
		expect(transport.messages[0].text).toContain('근거: Loki 로그와 latency 지표가 같은 외부 호출을 지목합니다.');
	});

	it('sends fallback email and records delivery when SMTP transport accepts it', async () => {
		const repository = new MemoryDeliveryRepository();
		const transport = new FakeTransport();
		const service = createService(repository, transport, {}, new FakeEvidenceCollector({
			keyMetrics: [{
				name: 'HTTP 5xx 비율',
				query: 'mwa:http_5xx_ratio:5m',
				value: 0.04,
				unit: 'ratio',
				interpretation: '최근 5분 HTTP 5xx 비율은 4.00%입니다.',
				source: 'prometheus',
			}],
		}));

		const result = await service.notifyIncident({
			incident,
			links: { grafanaDashboardUrl: 'https://grafana/d/backend' },
			evidence: { representativeMetricSummary: '5xx rate > 3%' },
		});

		expect(result.status).toBe('sent');
		expect(result.fallbackUsed).toBe(true);
		expect(transport.messages).toHaveLength(1);
		expect(transport.messages[0].text).toContain('1. 기본 요약');
		expect(transport.messages[0].text).toContain('2. 현재 확인된 정보');
		expect(transport.messages[0].text).toContain('최근 5분 HTTP 5xx 비율은 4.00%입니다.');
		expect(repository.records[0]).toMatchObject({ status: 'sent', fallbackUsed: true, llmUsed: false });

		const metrics = await getMetricsText();
		expect(metrics).toContain('mwa_email_render_total');
		expect(metrics).toContain('mwa_email_send_total');
		expect(metrics).toContain('mwa_email_fallback_total');
		expect(metrics).toContain('mwa_aiops_llm_diagnosis_total');
		expect(metrics).toContain('mwa_incident_to_email_latency_seconds');
	});

	it('renders collected key metrics and partial source warnings in fallback email', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/api/v1/query?')) {
				return new Response(JSON.stringify({ data: { result: [{ value: [1777220000, '0.04'] }] } }), { status: 200 });
			}

			if (url.includes('/loki/api/v1/query_range')) {
				return new Response('loki down', { status: 500 });
			}

			return new Response('{}', { status: 404 });
		});
		vi.stubGlobal('fetch', fetchMock);

		const repository = new MemoryDeliveryRepository();
		const transport = new FakeTransport();
		const env = {
			AIOPS_EVIDENCE_COLLECTION_ENABLED: 'true',
			AIOPS_EVIDENCE_TIMEOUT_MS: '1000',
		};
		const config = getEmailNotifierConfigFromEnv({
			EMAIL_DEFAULT_RECIPIENTS: 'sre@example.local,backend@example.local',
			AIOPS_LLM_ENABLED: 'false',
			...env,
		});
		const collector = new IncidentEvidenceCollector(
			config,
			new PrometheusEvidenceClient(config),
			new LokiEvidenceClient(config),
			new TempoEvidenceClient(config),
		);
		const service = createService(repository, transport, env, collector);

		const result = await service.notifyIncident({ incident });

		expect(result.status).toBe('sent');
		expect(transport.messages[0].text).toContain('HTTP 5xx 비율');
		expect(transport.messages[0].text).toContain('Loki evidence collection failed');
		expect(transport.messages[0].text).toContain('Tempo evidence collection skipped');
	});

	it('records SMTP failures without throwing', async () => {
		const repository = new MemoryDeliveryRepository();
		const service = createService(repository, new FakeTransport({ accepted: false, failureReason: 'smtp down' }));

		const result = await service.notifyIncident({ incident });

		expect(result.status).toBe('failed');
		expect(result.reason).toBe('smtp down');
		expect(repository.records[0]).toMatchObject({ status: 'failed', failureReason: 'smtp down' });
	});

	it('suppresses duplicate fingerprint in the same dedup bucket and records it', async () => {
		const repository = new MemoryDeliveryRepository();
		const transport = new FakeTransport();
		const evidenceCollector = new FakeEvidenceCollector();
		const service = createService(repository, transport, {}, evidenceCollector);

		await service.notifyIncident({ incident });
		const duplicate = await service.notifyIncident({ incident: { ...incident, incidentId: 'inc-error-2' } });

		expect(duplicate.status).toBe('suppressed');
		expect(duplicate.dedupSuppressed).toBe(true);
		expect(evidenceCollector.calls).toBe(1);
		expect(transport.messages).toHaveLength(1);
		expect(repository.records.at(-1)).toMatchObject({ status: 'suppressed', dedupSuppressed: true });
	});

	it('adds service routed recipients without duplicating default recipients', async () => {
		const repository = new MemoryDeliveryRepository();
		const transport = new FakeTransport();
		const service = createService(repository, transport, {
			EMAIL_PAYMENT_RECIPIENTS: 'payment@example.local,sre@example.local',
		});

		const result = await service.notifyIncident({
			incident: {
				...incident,
				incidentId: 'inc-payment-route',
				incidentType: 'payment_failure',
				serviceName: 'payment',
				fingerprint: 'fp-payment-route',
			},
		});

		expect(result.recipients).toEqual(['sre@example.local', 'backend@example.local', 'payment@example.local']);
		expect(transport.messages[0].to).toEqual(result.recipients);
	});
});
