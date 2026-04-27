import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocalLlmDiagnosisClient, parseDiagnosisResult } from '../../../src/notification/local-llm-diagnosis.client';
import { getEmailNotifierConfigFromEnv } from '../../../src/notification/notification.config';

describe('local LLM diagnosis parsing', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('parses Qwen JSON with thinking text removed', () => {
		const diagnosis = parseDiagnosisResult(`<think>reasoning</think>
			{
				"incident_type_ko": "결제 실패율 증가",
				"summary": "결제 실패율이 증가했습니다.",
				"customer_impact": "일부 사용자가 결제 실패를 경험할 수 있습니다.",
				"confirmed_evidence": ["payment failure ratio > 10%"],
				"likely_causes": [{"cause": "PG timeout", "confidence": "medium", "priority": 1, "reason": "로그와 지표가 PG 호출 지연을 함께 지목합니다."}],
				"immediate_actions": ["PG 상태를 확인합니다."],
				"followup_checks": ["최근 배포를 확인합니다."],
				"email_subject": "[HIGH] payment - 결제 실패율 증가",
				"final_severity": "high"
			}`);

		expect(diagnosis.summary).toContain('결제 실패율');
		expect(diagnosis.incidentTypeKo).toBe('결제 실패율 증가');
		expect(diagnosis.customerImpact).toContain('결제 실패');
		expect(diagnosis.confirmedEvidence).toEqual(['payment failure ratio > 10%']);
		expect(diagnosis.likelyCauses[0]).toMatchObject({
			cause: 'PG timeout',
			confidence: 'medium',
			priority: 1,
			reason: '로그와 지표가 PG 호출 지연을 함께 지목합니다.',
		});
		expect(diagnosis.finalSeverity).toBe('high');
	});

	it('rejects invalid JSON responses', () => {
		expect(() => parseDiagnosisResult('<think>only thoughts</think> no json')).toThrow(/JSON object/);
	});

	it('rejects likely causes without confirmed evidence', () => {
		expect(() => parseDiagnosisResult(JSON.stringify({
			summary: '결제 실패율이 증가했습니다.',
			customer_impact: '일부 사용자가 결제 실패를 경험할 수 있습니다.',
			confirmed_evidence: [],
			likely_causes: [{ cause: 'PG timeout', confidence: 'medium', priority: 1 }],
			immediate_actions: ['PG 상태를 확인합니다.'],
			followup_checks: ['최근 배포를 확인합니다.'],
			final_severity: 'high',
		}))).toThrow(/confirmed evidence/);
	});

	it('calls an OpenAI-compatible local server', async () => {
		const fetchMock = vi.fn(async () => {
			return new Response(JSON.stringify({
				choices: [{
					message: {
						content: JSON.stringify({
							summary: '체크아웃 지연이 감지되었습니다.',
							incident_type_ko: '체크아웃 응답 지연 급증',
							customer_impact: '주문 완료 시간이 증가할 수 있습니다.',
							confirmed_evidence: ['p95 latency > 1s'],
							likely_causes: [{ cause: 'DB saturation', confidence: 'high', priority: 1, reason: 'p95 latency와 DB metric이 함께 상승했습니다.' }],
							immediate_actions: ['DB connection 사용률을 확인합니다.'],
							followup_checks: ['느린 쿼리를 확인합니다.'],
							email_subject: '[HIGH] checkout - 지연 증가',
							final_severity: 'high',
						}),
					},
				}],
			}), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});
		vi.stubGlobal('fetch', fetchMock);

		const client = new LocalLlmDiagnosisClient(getEmailNotifierConfigFromEnv({
			AIOPS_LLM_ENABLED: 'true',
			AIOPS_LLM_BASE_URL: 'http://127.0.0.1:1234',
			AIOPS_LLM_MODEL: 'qwen/qwen3.6-27b',
		}));

		const diagnosis = await client.generateDiagnosis({
			incident: {
				incidentId: 'inc-1',
				incidentType: 'checkout_latency_spike',
				severity: 'high',
				serviceName: 'checkout',
				detectedAt: '2026-04-27T00:00:00.000Z',
				fingerprint: 'fp-1',
				source: 'test',
			},
			evidence: {
				keyMetrics: [{
					name: '주문 생성 p95 latency',
					query: 'mwa:order_create_latency_p95_seconds:5m',
					value: 1.4,
					unit: 'seconds',
					interpretation: '주문 생성 p95 latency는 1.400초입니다.',
					source: 'prometheus',
				}],
				rootCauseEvidence: [{
					source: 'tempo',
					description: 'Tempo trace에서 DB query span이 최장 구간으로 확인되었습니다.',
					traceId: '0123456789abcdef0123456789abcdef',
				}],
			},
		});

		const [, requestInit] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
		const request = JSON.parse(String(requestInit.body)) as {
			readonly messages: Array<{ readonly role: string; readonly content: string }>;
		};
		const userPayload = JSON.parse(request.messages[1]?.content ?? '{}') as {
			readonly evidence?: {
				readonly keyMetrics?: unknown;
				readonly rootCauseEvidence?: unknown;
			};
		};

		expect(fetchMock).toHaveBeenCalledWith(
			'http://127.0.0.1:1234/v1/chat/completions',
			expect.objectContaining({ method: 'POST' }),
		);
		expect(userPayload.evidence?.keyMetrics).toBeDefined();
		expect(userPayload.evidence?.rootCauseEvidence).toBeDefined();
		expect(diagnosis.emailSubject).toBe('[HIGH] checkout - 지연 증가');
		expect(diagnosis.incidentTypeKo).toBe('체크아웃 응답 지연 급증');
	});
});
