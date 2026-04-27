import type { IncidentSeverity } from './notification.types';

import process from 'node:process';

export type SmtpConfig = {
	readonly host: string;
	readonly port: number;
	readonly secure: boolean;
	readonly user?: string;
	readonly password?: string;
	readonly from: string;
};

export type LocalLlmConfig = {
	readonly enabled: boolean;
	readonly baseUrl: string;
	readonly model: string;
	readonly timeoutMs: number;
	readonly maxTokens: number;
	readonly temperature: number;
	readonly reasoningEffort?: string;
};

export type EvidenceCollectionConfig = {
	readonly enabled: boolean;
	readonly prometheusBaseUrl: string;
	readonly lokiBaseUrl: string;
	readonly tempoBaseUrl: string;
	readonly timeoutMs: number;
	readonly lookbackMinutes: number;
	readonly maxLogLines: number;
};

export type EmailNotifierConfig = {
	readonly enabled: boolean;
	readonly minSeverity: IncidentSeverity;
	readonly allowedIncidentTypes: readonly string[];
	readonly defaultRecipients: readonly string[];
	readonly paymentRecipients: readonly string[];
	readonly checkoutRecipients: readonly string[];
	readonly infraRecipients: readonly string[];
	readonly dedupWindowMinutes: number;
	readonly smtp: SmtpConfig;
	readonly llm: LocalLlmConfig;
	readonly evidence: EvidenceCollectionConfig;
};

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>;

const DEFAULT_ALLOWED_INCIDENT_TYPES = ['payment_failure', 'checkout_latency_spike', 'error_burst'];

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
	if (value === undefined || value.trim() === '') {
		return defaultValue;
	}

	return value.trim().toLowerCase() === 'true';
}

function parseNumber(value: string | undefined, defaultValue: number): number {
	if (value === undefined || value.trim() === '') {
		return defaultValue;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseList(value: string | undefined, defaultValue: readonly string[]): readonly string[] {
	if (value === undefined || value.trim() === '') {
		return defaultValue;
	}

	return value
		.split(',')
		.map(entry => entry.trim())
		.filter(entry => entry.length > 0);
}

function parseOptionalString(value: string | undefined, defaultValue?: string): string | undefined {
	if (value === undefined) {
		return defaultValue;
	}

	const trimmed = value.trim();
	return trimmed.length === 0 ? undefined : trimmed;
}

function parseSeverity(value: string | undefined): IncidentSeverity {
	const normalized = value?.trim().toLowerCase();
	if (
		normalized === 'low'
		|| normalized === 'medium'
		|| normalized === 'high'
		|| normalized === 'critical'
		|| normalized === 'info'
		|| normalized === 'warning'
	) {
		return normalized;
	}

	return 'high';
}

export function getEmailNotifierConfigFromEnv(env: Env = process.env): EmailNotifierConfig {
	const smtpUser = env.SMTP_USER?.trim();
	const smtpPassword = env.SMTP_PASSWORD?.trim();

	return {
		enabled: parseBoolean(env.EMAIL_NOTIFIER_ENABLED, false),
		minSeverity: parseSeverity(env.EMAIL_MIN_SEVERITY),
		allowedIncidentTypes: parseList(env.EMAIL_ALLOWED_INCIDENT_TYPES, DEFAULT_ALLOWED_INCIDENT_TYPES),
		defaultRecipients: parseList(env.EMAIL_DEFAULT_RECIPIENTS, ['sre@example.local']),
		paymentRecipients: parseList(env.EMAIL_PAYMENT_RECIPIENTS, []),
		checkoutRecipients: parseList(env.EMAIL_CHECKOUT_RECIPIENTS, []),
		infraRecipients: parseList(env.EMAIL_INFRA_RECIPIENTS, []),
		dedupWindowMinutes: parseNumber(env.EMAIL_DEDUP_WINDOW_MINUTES, 30),
		smtp: {
			host: env.SMTP_HOST ?? 'localhost',
			port: parseNumber(env.SMTP_PORT, 1025),
			secure: parseBoolean(env.SMTP_SECURE, false),
			user: smtpUser === undefined || smtpUser.length === 0 ? undefined : smtpUser,
			password: smtpPassword === undefined || smtpPassword.length === 0 ? undefined : smtpPassword,
			from: env.SMTP_FROM ?? 'MWA AIOps <alerts@example.local>',
		},
		llm: {
			enabled: parseBoolean(env.AIOPS_LLM_ENABLED, false),
			baseUrl: env.AIOPS_LLM_BASE_URL ?? 'http://127.0.0.1:1234',
			model: env.AIOPS_LLM_MODEL ?? 'qwen/qwen3.6-27b',
			timeoutMs: parseNumber(env.AIOPS_LLM_TIMEOUT_MS, 180000),
			maxTokens: parseNumber(env.AIOPS_LLM_MAX_TOKENS, 1000),
			temperature: parseNumber(env.AIOPS_LLM_TEMPERATURE, 0.2),
			reasoningEffort: parseOptionalString(env.AIOPS_LLM_REASONING_EFFORT, 'none'),
		},
		evidence: {
			enabled: parseBoolean(env.AIOPS_EVIDENCE_COLLECTION_ENABLED, true),
			prometheusBaseUrl: env.PROMETHEUS_BASE_URL ?? 'http://127.0.0.1:9090',
			lokiBaseUrl: env.LOKI_BASE_URL ?? 'http://127.0.0.1:3100',
			tempoBaseUrl: env.TEMPO_BASE_URL ?? 'http://127.0.0.1:3200',
			timeoutMs: parseNumber(env.AIOPS_EVIDENCE_TIMEOUT_MS, 3000),
			lookbackMinutes: parseNumber(env.AIOPS_EVIDENCE_LOOKBACK_MINUTES, 10),
			maxLogLines: parseNumber(env.AIOPS_EVIDENCE_MAX_LOG_LINES, 5),
		},
	};
}
