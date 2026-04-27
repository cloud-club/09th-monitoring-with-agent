import type { EmailNotifierConfig } from './notification.config';

import type { DiagnosisCause, DiagnosisResult, NotifyIncidentInput } from './notification.types';
import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_NOTIFIER_CONFIG } from './notification.tokens';

type OpenAiChatResponse = {
	readonly choices?: Array<{
		readonly message?: {
			readonly content?: string;
		};
	}>;
};

const DIAGNOSIS_SYSTEM_PROMPT = [
	'You are an AIOps incident analyst for an ecommerce service.',
	'Write Korean operator-facing incident diagnosis.',
	'Separate confirmed evidence from likely causes. Never present hypotheses as facts.',
	'Use only the provided evidence.keyMetrics and evidence.rootCauseEvidence when writing confirmed_evidence and likely_causes[].reason.',
	'Every likely cause must include a reason linked to Prometheus, Loki, or Tempo evidence.',
	'Keep summary to 2-3 sentences, confirmed evidence to at most 3 items, likely causes to at most 2 items, actions to at most 3 items.',
	'Do not include raw stack traces, raw trace JSON, secrets, tokens, API keys, passwords, or personal data.',
	'Return JSON only. Do not use markdown.',
	'The JSON object must contain:',
	'{',
	'  "incident_type_ko": "Korean incident type name",',
	'  "summary": "2-3 sentence Korean summary",',
	'  "customer_impact": "Korean customer/business impact",',
	'  "confirmed_evidence": ["facts only"],',
	'  "likely_causes": [{"cause": "hypothesis", "confidence": "low|medium|high", "priority": 1, "reason": "evidence-linked reason"}],',
	'  "immediate_actions": ["operator action"],',
	'  "followup_checks": ["verification item"],',
	'  "email_subject": "[HIGH] service - summary",',
	'  "final_severity": "low|medium|high|critical"',
	'}',
].join('\n');

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asStringArray(value: unknown): readonly string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.map(asString).filter((entry): entry is string => entry !== undefined);
}

function normalizeCause(value: unknown): DiagnosisCause | undefined {
	if (typeof value === 'string') {
		return { cause: value };
	}

	if (value === null || typeof value !== 'object') {
		return undefined;
	}

	const record = value as Record<string, unknown>;
	const cause = asString(record.cause);
	if (cause === undefined) {
		return undefined;
	}

	const confidence = asString(record.confidence);
	const priority = typeof record.priority === 'number' && Number.isFinite(record.priority) ? record.priority : undefined;
	const reason = asString(record.reason);

	return {
		cause,
		confidence: confidence === 'low' || confidence === 'medium' || confidence === 'high' ? confidence : undefined,
		priority,
		reason,
	};
}

function normalizeSeverity(value: unknown): DiagnosisResult['finalSeverity'] {
	const severity = asString(value)?.toLowerCase();
	if (severity === 'low' || severity === 'medium' || severity === 'high' || severity === 'critical') {
		return severity;
	}

	return undefined;
}

function assertUsefulDiagnosis(diagnosis: DiagnosisResult): void {
	if (diagnosis.likelyCauses.length > 0 && diagnosis.confirmedEvidence.length === 0) {
		throw new Error('LLM response has likely causes without confirmed evidence');
	}

	const forbiddenAssertionPattern = /확정|분명|반드시|단정|100%|definitely|certainly/i;
	const hasOverconfidentCause = diagnosis.likelyCauses.some(cause => forbiddenAssertionPattern.test(cause.cause));
	if (hasOverconfidentCause) {
		throw new Error('LLM response contains overconfident cause language');
	}

	const hasOversizedField = [
		diagnosis.summary,
		diagnosis.customerImpact,
		...diagnosis.confirmedEvidence,
		...diagnosis.likelyCauses.map(cause => cause.cause),
		...diagnosis.likelyCauses.map(cause => cause.reason ?? ''),
		...diagnosis.immediateActions,
		...diagnosis.followupChecks,
	].some(value => value.length > 700);

	if (hasOversizedField) {
		throw new Error('LLM response is too verbose for email reporting');
	}
}

export function stripQwenThinkingText(content: string): string {
	return content
		.replace(/<think>[\s\S]*?<\/think>/gi, '')
		.trim();
}

export function extractJsonObject(content: string): string {
	const stripped = stripQwenThinkingText(content);
	const start = stripped.indexOf('{');
	const end = stripped.lastIndexOf('}');

	if (start === -1 || end === -1 || end <= start) {
		throw new Error('LLM response does not contain a JSON object');
	}

	return stripped.slice(start, end + 1);
}

export function parseDiagnosisResult(content: string): DiagnosisResult {
	const parsed = JSON.parse(extractJsonObject(content)) as Record<string, unknown>;
	const summary = asString(parsed.summary);
	const customerImpact = asString(parsed.customer_impact ?? parsed.customerImpact);

	if (summary === undefined || customerImpact === undefined) {
		throw new Error('LLM response is missing required diagnosis fields');
	}

	const rawLikelyCauses = parsed.likely_causes ?? parsed.likelyCauses;
	const likelyCauses = Array.isArray(rawLikelyCauses)
		? rawLikelyCauses.map(normalizeCause).filter((cause): cause is DiagnosisCause => cause !== undefined)
		: [];

	const diagnosis = {
		summary,
		customerImpact,
		confirmedEvidence: asStringArray(parsed.confirmed_evidence ?? parsed.confirmedEvidence),
		likelyCauses,
		immediateActions: asStringArray(parsed.immediate_actions ?? parsed.immediateActions),
		followupChecks: asStringArray(parsed.followup_checks ?? parsed.followupChecks),
		incidentTypeKo: asString(parsed.incident_type_ko ?? parsed.incidentTypeKo),
		emailSubject: asString(parsed.email_subject ?? parsed.emailSubject),
		finalSeverity: normalizeSeverity(parsed.final_severity ?? parsed.finalSeverity),
	};
	assertUsefulDiagnosis(diagnosis);
	return diagnosis;
}

@Injectable()
export class LocalLlmDiagnosisClient {
	public constructor(
		@Inject(EMAIL_NOTIFIER_CONFIG)
		private readonly config: EmailNotifierConfig,
	) {}

	public async generateDiagnosis(input: NotifyIncidentInput): Promise<DiagnosisResult> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.config.llm.timeoutMs);

		try {
			const response = await fetch(`${this.config.llm.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					model: this.config.llm.model,
					temperature: this.config.llm.temperature,
					max_tokens: this.config.llm.maxTokens,
					messages: [
						{ role: 'system', content: DIAGNOSIS_SYSTEM_PROMPT },
						{
							role: 'user',
							content: JSON.stringify({
								incident: input.incident,
								evidence: input.evidence ?? {},
								links: input.links ?? {},
							}),
						},
					],
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`LLM request failed with ${response.status}`);
			}

			const payload = await response.json() as OpenAiChatResponse;
			const content = payload.choices?.[0]?.message?.content;
			if (content === undefined) {
				throw new Error('LLM response did not include message content');
			}

			return parseDiagnosisResult(content);
		}
		finally {
			clearTimeout(timeout);
		}
	}
}
