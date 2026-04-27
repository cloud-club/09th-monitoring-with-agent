import type { IncidentPacket } from '../../../src/notification/notification.types';

import { describe, expect, it } from 'vitest';
import { EmailDedupService } from '../../../src/notification/email-dedup.service';
import { EmailNotificationPolicyService } from '../../../src/notification/email-notification-policy.service';
import { IncidentEmailRenderer } from '../../../src/notification/incident-email.renderer';
import { getEmailNotifierConfigFromEnv } from '../../../src/notification/notification.config';

const incident: IncidentPacket = {
	incidentId: 'inc-payment-1',
	incidentType: 'payment_failure',
	severity: 'high',
	serviceName: 'payment',
	detectedAt: '2026-04-27T00:10:00.000Z',
	fingerprint: 'fp-payment',
	source: 'alertmanager',
	generatorUrl: 'https://alert/source',
};

describe('email notification policy, dedup, and renderer', () => {
	it('parses SMTP and local Qwen environment defaults safely', () => {
		const config = getEmailNotifierConfigFromEnv({
			EMAIL_NOTIFIER_ENABLED: 'true',
			SMTP_HOST: 'smtp.local',
			SMTP_PORT: '465',
			SMTP_SECURE: 'true',
			SMTP_USER: 'user',
			SMTP_PASSWORD: 'secret',
			SMTP_FROM: 'MWA <alerts@example.local>',
			EMAIL_PAYMENT_RECIPIENTS: 'payment@example.local',
			EMAIL_CHECKOUT_RECIPIENTS: 'checkout@example.local',
			EMAIL_INFRA_RECIPIENTS: 'infra@example.local',
			AIOPS_LLM_ENABLED: 'true',
			AIOPS_LLM_BASE_URL: 'http://127.0.0.1:1234',
			AIOPS_LLM_MODEL: 'qwen/qwen3.6-27b',
		});

		expect(config.enabled).toBe(true);
		expect(config.smtp).toMatchObject({
			host: 'smtp.local',
			port: 465,
			secure: true,
			user: 'user',
			password: 'secret',
			from: 'MWA <alerts@example.local>',
		});
		expect(config.llm).toMatchObject({
			enabled: true,
			baseUrl: 'http://127.0.0.1:1234',
			model: 'qwen/qwen3.6-27b',
		});
		expect(config.paymentRecipients).toEqual(['payment@example.local']);
		expect(config.checkoutRecipients).toEqual(['checkout@example.local']);
		expect(config.infraRecipients).toEqual(['infra@example.local']);
	});

	it('allows high and critical MVP incidents and suppresses low severity', () => {
		const policy = new EmailNotificationPolicyService(getEmailNotifierConfigFromEnv({}));

		expect(policy.evaluate(incident).shouldSend).toBe(true);
		expect(policy.evaluate({ ...incident, severity: 'critical' }).shouldSend).toBe(true);
		expect(policy.evaluate({ ...incident, severity: 'low' }).shouldSend).toBe(false);
	});

	it('creates stable dedup keys inside the configured time bucket', () => {
		const service = new EmailDedupService(getEmailNotifierConfigFromEnv({ EMAIL_DEDUP_WINDOW_MINUTES: '30' }));

		const first = service.createDedupDecision(incident);
		const second = service.createDedupDecision({
			...incident,
			detectedAt: '2026-04-27T00:25:00.000Z',
		});

		expect(first.dedupKey).toBe(second.dedupKey);
		expect(first.dedupKey).toContain('fp-payment');
		expect(first.dedupKey).toContain('payment_failure');
	});

	it('renders the operator incident report format with evidence and hypotheses separated', () => {
		const renderer = new IncidentEmailRenderer();
		const report = renderer.render({
			incident,
			fallbackUsed: false,
			links: {
				grafanaDashboardUrl: 'https://grafana/d/payment',
				lokiQueryUrl: 'https://loki/query',
				tempoTraceUrl: 'https://tempo/trace',
			},
			evidence: {
				keyMetrics: [{
					name: '결제 완료율',
					query: 'mwa:payment_completion_ratio:5m',
					value: 0.812,
					unit: 'ratio',
					interpretation: '최근 5분 결제 완료율은 81.2%입니다.',
					source: 'prometheus',
				}],
				rootCauseEvidence: [{
					source: 'loki',
					description: 'Loki 로그에서 PG timeout이 반복 관찰되었습니다.',
					relatedCause: 'PG 연동 timeout',
				}],
			},
			diagnosis: {
				summary: '결제 실패율이 증가했습니다.',
				customerImpact: '일부 사용자가 결제 실패를 경험했을 수 있습니다.',
				confirmedEvidence: ['결제 실패율 10% 초과'],
				likelyCauses: [{ cause: 'PG 연동 timeout', confidence: 'medium', priority: 1, reason: 'Loki 로그와 latency 지표가 PG 호출 지연을 지목합니다.' }],
				immediateActions: ['PG 상태 페이지를 확인합니다.'],
				followupChecks: ['최근 배포 이력을 확인합니다.'],
				incidentTypeKo: '결제 실패율 증가',
				emailSubject: '[HIGH] payment - 결제 실패율 증가 / PG 연동 타임아웃 의심',
				finalSeverity: 'high',
			},
		});

		expect(report.subject).toBe('[HIGH] payment - 결제 실패율 증가 / PG 연동 타임아웃 의심');
		expect(report.textBody).toContain('사건 유형: 결제 실패율 증가');
		expect(report.textBody).toContain('1. 요약');
		expect(report.textBody).toContain('4. 핵심 지표');
		expect(report.textBody).toContain('9. 비고');
		expect(report.textBody).toContain('결제 완료율: 0.812 ratio - 최근 5분 결제 완료율은 81.2%입니다.');
		expect(report.textBody).toContain('[loki] Loki 로그에서 PG timeout이 반복 관찰되었습니다.');
		expect(report.textBody).toContain('  근거: Loki 로그와 latency 지표가 PG 호출 지연을 지목합니다.');
		expect(report.textBody.indexOf('4. 핵심 지표')).toBeLessThan(report.textBody.indexOf('5. 원인 후보'));
		expect(report.htmlBody).toContain('https://grafana/d/payment');
	});

	it('limits long report sections, masks sensitive text, and merges partial evidence state into notes', () => {
		const renderer = new IncidentEmailRenderer();
		const report = renderer.render({
			incident,
			fallbackUsed: false,
			links: {
				lokiQueryUrl: 'https://loki/query?token=abcdef1234567890abcdef1234567890abcdef',
			},
			evidence: {
				unavailableSources: ['Tempo'],
				collectionWarnings: ['Loki 일부 shard timeout'],
			},
			diagnosis: {
				summary: '첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다. 넷째 문장은 잘려야 합니다.',
				customerImpact: '사용자 email test@example.com 과 token=abcdef1234567890abcdef1234567890abcdef 가 노출되면 안 됩니다.',
				confirmedEvidence: ['one', 'two', 'three', 'four'],
				likelyCauses: [
					{ cause: '첫 번째 원인 후보입니다.', confidence: 'medium', priority: 1, reason: '첫 번째 근거입니다.' },
					{ cause: '두 번째 원인 후보입니다.', confidence: 'low', priority: 2, reason: '두 번째 근거입니다.' },
					{ cause: '세 번째 원인 후보는 노출되지 않아야 합니다.', confidence: 'low', priority: 3, reason: '세 번째 근거입니다.' },
				],
				immediateActions: ['a', 'b', 'c', 'd'],
				followupChecks: ['x', 'y', 'z', 'w'],
				finalSeverity: 'high',
			},
		});

		expect(report.subject).toContain('[HIGH] payment - 결제 실패율 증가 /');
		expect(report.textBody).not.toContain('[증거 수집 상태]');
		expect(report.textBody).toContain('9. 비고');
		expect(report.textBody).toContain('Tempo 증거는 수집되지 않았습니다.');
		expect(report.textBody).toContain('Loki 일부 shard timeout');
		expect(report.textBody).toContain('[masked-email]');
		expect(report.textBody).toContain('token=[masked]');
		expect(report.textBody).not.toContain('넷째 문장');
		expect(report.textBody).not.toContain('- four');
		expect(report.textBody).not.toContain('세 번째 원인 후보');
		expect(report.htmlBody).toContain('token=%5Bmasked%5D');
	});

	it('creates fallback diagnosis and renders the compact fallback report format', () => {
		const renderer = new IncidentEmailRenderer();
		const fallback = renderer.createFallbackDiagnosis(incident, {
			representativeMetricSummary: 'payment failure ratio 12%',
			keyMetrics: [{
				name: '결제 실패 건수 증가',
				query: 'sum(increase(mwa_payment_attempt_total{result="failed"}[5m]))',
				value: 12,
				unit: 'count',
				interpretation: '최근 5분 결제 실패 증가 건수는 12건입니다.',
				source: 'prometheus',
			}],
		});
		const report = renderer.render({
			incident,
			diagnosis: fallback,
			evidence: {
				keyMetrics: [{
					name: '결제 실패 건수 증가',
					query: 'sum(increase(mwa_payment_attempt_total{result="failed"}[5m]))',
					value: 12,
					unit: 'count',
					interpretation: '최근 5분 결제 실패 증가 건수는 12건입니다.',
					source: 'prometheus',
				}],
			},
			fallbackUsed: true,
			links: {
				grafanaDashboardUrl: 'https://grafana/d/payment',
			},
		});

		expect(fallback.incidentTypeKo).toBe('결제 실패율 증가');
		expect(fallback.confirmedEvidence).toContain('payment failure ratio 12%');
		expect(report.subject).toContain('[HIGH] payment - 결제 실패율 증가 /');
		expect(report.textBody).toContain('1. 기본 요약');
		expect(report.textBody).toContain('2. 현재 확인된 정보');
		expect(report.textBody).toContain('최근 5분 결제 실패 증가 건수는 12건입니다.');
		expect(report.textBody).toContain('3. 즉시 확인 링크');
		expect(report.textBody).toContain('4. 비고');
		expect(report.textBody).not.toContain('2. 사용자 영향');
	});
});
