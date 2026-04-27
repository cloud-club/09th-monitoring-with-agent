import type { EmailNotifierConfig } from './notification.config';
import type {
	IncidentDrilldownLinks,
	IncidentEvidencePacket,
	IncidentMetricEvidence,
	IncidentPacket,
	IncidentRootCauseEvidence,
	NotifyIncidentInput,
} from './notification.types';

import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_NOTIFIER_CONFIG } from './notification.tokens';

type EvidenceCollectionResult = {
	readonly evidence?: IncidentEvidencePacket;
	readonly links?: IncidentDrilldownLinks;
};

type PrometheusMetricQuery = {
	readonly name: string;
	readonly query: string;
	readonly unit?: string;
	readonly interpretation: (value: number) => string;
};

type LokiLogObservation = {
	readonly description: string;
	readonly traceId?: string;
	readonly logSample?: string;
};

const TRACE_ID_PATTERN = /\b[0-9a-f]{32}\b/i;
const MAX_ROOT_CAUSE_EVIDENCE = 5;

function truncate(value: string, maxLength: number = 220): string {
	const trimmed = value.trim();
	if (trimmed.length <= maxLength) {
		return trimmed;
	}

	return `${trimmed.slice(0, maxLength - 1)}…`;
}

function parseScalar(payload: unknown): number | undefined {
	if (payload === null || typeof payload !== 'object') {
		return undefined;
	}

	const result = (payload as { data?: { result?: unknown } }).data?.result;
	if (!Array.isArray(result)) {
		return undefined;
	}

	const values = result
		.map((entry) => {
			if (entry === null || typeof entry !== 'object') {
				return undefined;
			}

			const value = (entry as { value?: unknown }).value;
			if (!Array.isArray(value)) {
				return undefined;
			}

			const parsed = Number(value[1]);
			return Number.isFinite(parsed) ? parsed : undefined;
		})
		.filter((value): value is number => value !== undefined);

	return values.length === 0 ? undefined : Math.max(...values);
}

function metricQueriesForIncident(incidentType: string): readonly PrometheusMetricQuery[] {
	if (incidentType === 'payment_failure') {
		return [
			{
				name: '결제 완료율',
				query: 'mwa:payment_completion_ratio:5m',
				unit: 'ratio',
				interpretation: value => `최근 5분 결제 완료율은 ${(value * 100).toFixed(1)}%입니다.`,
			},
			{
				name: '결제 처리 p95 latency',
				query: 'mwa:payment_processing_latency_p95_seconds:5m',
				unit: 'seconds',
				interpretation: value => `결제 처리 p95 latency는 ${value.toFixed(3)}초입니다.`,
			},
			{
				name: '결제 실패 건수 증가',
				query: 'sum(increase(mwa_payment_attempt_total{result="failed"}[5m]))',
				unit: 'count',
				interpretation: value => `최근 5분 결제 실패 증가 건수는 ${value.toFixed(0)}건입니다.`,
			},
		];
	}

	if (incidentType === 'checkout_latency_spike') {
		return [
			{
				name: 'HTTP p95 latency',
				query: 'mwa:http_latency_p95_seconds:5m',
				unit: 'seconds',
				interpretation: value => `전체 HTTP p95 latency는 ${value.toFixed(3)}초입니다.`,
			},
			{
				name: '주문 생성 p95 latency',
				query: 'mwa:order_create_latency_p95_seconds:5m',
				unit: 'seconds',
				interpretation: value => `주문 생성 p95 latency는 ${value.toFixed(3)}초입니다.`,
			},
			{
				name: '결제 시도 p95 latency',
				query: 'mwa:payment_attempt_latency_p95_seconds:5m',
				unit: 'seconds',
				interpretation: value => `결제 시도 p95 latency는 ${value.toFixed(3)}초입니다.`,
			},
			{
				name: 'DB connection 사용률',
				query: 'mwa:db_connections_used_ratio:5m',
				unit: 'ratio',
				interpretation: value => `DB connection 사용률은 ${(value * 100).toFixed(1)}%입니다.`,
			},
		];
	}

	if (incidentType === 'error_burst') {
		return [
			{
				name: 'HTTP 5xx 비율',
				query: 'mwa:http_5xx_ratio:5m',
				unit: 'ratio',
				interpretation: value => `최근 5분 HTTP 5xx 비율은 ${(value * 100).toFixed(2)}%입니다.`,
			},
			{
				name: 'HTTP 5xx 증가 건수',
				query: 'sum(increase(mwa_http_requests_total{service="backend",status_code=~"5.."}[5m]))',
				unit: 'count',
				interpretation: value => `최근 5분 HTTP 5xx 증가 건수는 ${value.toFixed(0)}건입니다.`,
			},
			{
				name: 'Apdex score',
				query: 'mwa:apdex_score:5m',
				unit: 'score',
				interpretation: value => `최근 5분 Apdex score는 ${value.toFixed(3)}입니다.`,
			},
		];
	}

	return [];
}

function lokiQueryForIncident(incident: IncidentPacket): string {
	const base = '{service_name="mwa-backend"} | json';
	if (incident.incidentType === 'payment_failure') {
		return `${base} | line_format "{{.timestamp}} trace={{.trace_id}} endpoint={{.endpoint}} status={{.status_code}} error={{.error_code}} message={{.message}}" |~ "payment|payment-attempts|PG|pg"`;
	}

	if (incident.incidentType === 'checkout_latency_spike') {
		return `${base} | line_format "{{.timestamp}} trace={{.trace_id}} endpoint={{.endpoint}} status={{.status_code}} error={{.error_code}} message={{.message}}" |~ "/api/orders|payment-attempts|timeout|latency"`;
	}

	if (incident.incidentType === 'error_burst') {
		return `${base} | status_code >= 500 or error_code != "" | line_format "{{.timestamp}} trace={{.trace_id}} endpoint={{.endpoint}} status={{.status_code}} error={{.error_code}} message={{.message}}"`;
	}

	return `${base} | line_format "{{.timestamp}} trace={{.trace_id}} endpoint={{.endpoint}} status={{.status_code}} error={{.error_code}} message={{.message}}"`;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, { signal: controller.signal });
		if (!response.ok) {
			throw new Error(`request failed with ${response.status}`);
		}

		return await response.json();
	}
	finally {
		clearTimeout(timeout);
	}
}

function extractLokiLogs(payload: unknown, maxLines: number): readonly LokiLogObservation[] {
	if (payload === null || typeof payload !== 'object') {
		return [];
	}

	const result = (payload as { data?: { result?: unknown } }).data?.result;
	if (!Array.isArray(result)) {
		return [];
	}

	const rows: LokiLogObservation[] = [];
	for (const stream of result) {
		if (stream === null || typeof stream !== 'object') {
			continue;
		}

		const values = (stream as { values?: unknown }).values;
		if (!Array.isArray(values)) {
			continue;
		}

		for (const value of values) {
			if (!Array.isArray(value) || typeof value[1] !== 'string') {
				continue;
			}

			const line = truncate(value[1]);
			rows.push({
				description: `Loki 로그에서 관련 이벤트가 관찰되었습니다: ${line}`,
				traceId: TRACE_ID_PATTERN.exec(line)?.[0],
				logSample: line,
			});
			if (rows.length >= maxLines) {
				return rows;
			}
		}
	}

	return rows;
}

function findTempoSpanSummaries(payload: unknown, traceId: string): readonly IncidentRootCauseEvidence[] {
	const spans: Array<{ name: string; durationMs?: number; error?: boolean }> = [];

	function visit(value: unknown): void {
		if (value === null || typeof value !== 'object') {
			return;
		}

		if (Array.isArray(value)) {
			for (const entry of value) {
				visit(entry);
			}
			return;
		}

		const record = value as Record<string, unknown>;
		if (typeof record.name === 'string') {
			const durationNano = typeof record.durationNano === 'string' || typeof record.durationNano === 'number'
				? Number(record.durationNano)
				: undefined;
			const attributes = Array.isArray(record.attributes) ? record.attributes : [];
			const error = attributes.some((attribute) => {
				if (attribute === null || typeof attribute !== 'object') {
					return false;
				}

				const key = (attribute as { key?: unknown }).key;
				const attrValue = (attribute as { value?: unknown }).value;
				return key === 'error' || JSON.stringify(attrValue).toLowerCase().includes('error');
			});
			spans.push({
				name: truncate(record.name),
				durationMs: Number.isFinite(durationNano) ? Number(durationNano) / 1_000_000 : undefined,
				error,
			});
		}

		for (const entry of Object.values(record)) {
			visit(entry);
		}
	}

	visit(payload);

	const errorSpan = spans.find(span => span.error === true);
	const longestSpan = spans
		.filter(span => span.durationMs !== undefined)
		.sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))[0];

	const evidence: IncidentRootCauseEvidence[] = [];
	if (errorSpan !== undefined) {
		evidence.push({
			source: 'tempo',
			description: `Tempo trace ${traceId}에서 error span ${errorSpan.name}이 확인되었습니다.`,
			traceId,
		});
	}

	if (longestSpan !== undefined) {
		evidence.push({
			source: 'tempo',
			description: `Tempo trace ${traceId}의 최장 span은 ${longestSpan.name} (${longestSpan.durationMs?.toFixed(1)}ms)입니다.`,
			traceId,
		});
	}

	return evidence;
}

function mergeUniqueStrings(left: readonly string[] | undefined, right: readonly string[]): readonly string[] | undefined {
	const merged = [...new Set([...(left ?? []), ...right].filter(value => value.trim().length > 0))];
	return merged.length === 0 ? undefined : merged;
}

function mergeEvidence(
	input: IncidentEvidencePacket | undefined,
	collected: IncidentEvidencePacket,
): IncidentEvidencePacket {
	return {
		representativeMetricSummary: input?.representativeMetricSummary ?? collected.representativeMetricSummary,
		representativeLogLink: input?.representativeLogLink ?? collected.representativeLogLink,
		representativeTraceLink: input?.representativeTraceLink ?? collected.representativeTraceLink,
		observations: mergeUniqueStrings(input?.observations, collected.observations ?? []),
		keyMetrics: [...(input?.keyMetrics ?? []), ...(collected.keyMetrics ?? [])],
		rootCauseEvidence: [...(input?.rootCauseEvidence ?? []), ...(collected.rootCauseEvidence ?? [])],
		unavailableSources: mergeUniqueStrings(input?.unavailableSources, collected.unavailableSources ?? []),
		collectionWarnings: mergeUniqueStrings(input?.collectionWarnings, collected.collectionWarnings ?? []),
	};
}

function mergeLinks(input: IncidentDrilldownLinks | undefined, collected: IncidentDrilldownLinks): IncidentDrilldownLinks {
	return {
		grafanaDashboardUrl: input?.grafanaDashboardUrl ?? collected.grafanaDashboardUrl,
		lokiQueryUrl: input?.lokiQueryUrl ?? collected.lokiQueryUrl,
		tempoTraceUrl: input?.tempoTraceUrl ?? collected.tempoTraceUrl,
		alertSourceUrl: input?.alertSourceUrl ?? collected.alertSourceUrl,
	};
}

@Injectable()
export class PrometheusEvidenceClient {
	public constructor(
		@Inject(EMAIL_NOTIFIER_CONFIG)
		private readonly config: EmailNotifierConfig,
	) {}

	public async collect(incident: IncidentPacket): Promise<readonly IncidentMetricEvidence[]> {
		const queries = metricQueriesForIncident(incident.incidentType);
		const metrics: IncidentMetricEvidence[] = [];

		for (const query of queries) {
			const url = `${this.config.evidence.prometheusBaseUrl.replace(/\/$/, '')}/api/v1/query?query=${encodeURIComponent(query.query)}`;
			const payload = await fetchJsonWithTimeout(url, this.config.evidence.timeoutMs);
			const value = parseScalar(payload);
			if (value === undefined) {
				continue;
			}

			metrics.push({
				name: query.name,
				query: query.query,
				value,
				unit: query.unit,
				interpretation: query.interpretation(value),
				source: 'prometheus',
			});
		}

		return metrics;
	}
}

@Injectable()
export class LokiEvidenceClient {
	public constructor(
		@Inject(EMAIL_NOTIFIER_CONFIG)
		private readonly config: EmailNotifierConfig,
	) {}

	public async collect(incident: IncidentPacket): Promise<{ readonly evidence: readonly IncidentRootCauseEvidence[]; readonly link: string; readonly traceIds: readonly string[] }> {
		const query = lokiQueryForIncident(incident);
		const endMs = Date.now();
		const startMs = endMs - this.config.evidence.lookbackMinutes * 60_000;
		const params = new URLSearchParams({
			end: `${endMs * 1_000_000}`,
			limit: String(this.config.evidence.maxLogLines),
			query,
			start: `${startMs * 1_000_000}`,
		});
		const link = `${this.config.evidence.lokiBaseUrl.replace(/\/$/, '')}/loki/api/v1/query_range?${params.toString()}`;
		const payload = await fetchJsonWithTimeout(link, this.config.evidence.timeoutMs);
		const logs = extractLokiLogs(payload, this.config.evidence.maxLogLines);

		return {
			evidence: logs.map(log => ({
				source: 'loki',
				description: log.description,
				traceId: log.traceId,
				logSample: log.logSample,
			})),
			link,
			traceIds: [...new Set(logs.map(log => log.traceId).filter((traceId): traceId is string => traceId !== undefined))],
		};
	}
}

@Injectable()
export class TempoEvidenceClient {
	public constructor(
		@Inject(EMAIL_NOTIFIER_CONFIG)
		private readonly config: EmailNotifierConfig,
	) {}

	public async collect(traceId: string): Promise<{ readonly evidence: readonly IncidentRootCauseEvidence[]; readonly link: string }> {
		const link = `${this.config.evidence.tempoBaseUrl.replace(/\/$/, '')}/api/traces/${encodeURIComponent(traceId)}`;
		const payload = await fetchJsonWithTimeout(link, this.config.evidence.timeoutMs);
		return {
			evidence: findTempoSpanSummaries(payload, traceId),
			link,
		};
	}
}

@Injectable()
export class IncidentEvidenceCollector {
	public constructor(
		@Inject(EMAIL_NOTIFIER_CONFIG)
		private readonly config: EmailNotifierConfig,
		private readonly prometheus: PrometheusEvidenceClient,
		private readonly loki: LokiEvidenceClient,
		private readonly tempo: TempoEvidenceClient,
	) {}

	public async collect(input: NotifyIncidentInput): Promise<EvidenceCollectionResult> {
		if (!this.config.evidence.enabled || metricQueriesForIncident(input.incident.incidentType).length === 0) {
			return {
				evidence: input.evidence,
				links: input.links,
			};
		}

		const keyMetrics: IncidentMetricEvidence[] = [];
		const rootCauseEvidence: IncidentRootCauseEvidence[] = [];
		const warnings: string[] = [];
		const unavailableSources: string[] = [];
		let lokiLink: string | undefined;
		let tempoLink: string | undefined;
		let traceIds: readonly string[] = [];

		try {
			const metrics = await this.prometheus.collect(input.incident);
			keyMetrics.push(...metrics);
			rootCauseEvidence.push(...metrics.map(metric => ({
				source: 'prometheus' as const,
				description: metric.interpretation,
				metricName: metric.name,
			})));
		}
		catch (error) {
			unavailableSources.push('Prometheus');
			warnings.push(`Prometheus evidence collection failed: ${error instanceof Error ? error.message : 'unknown error'}`);
		}

		try {
			const loki = await this.loki.collect(input.incident);
			lokiLink = loki.link;
			traceIds = loki.traceIds;
			rootCauseEvidence.push(...loki.evidence);
		}
		catch (error) {
			unavailableSources.push('Loki');
			warnings.push(`Loki evidence collection failed: ${error instanceof Error ? error.message : 'unknown error'}`);
		}

		const traceId = traceIds[0];
		if (traceId === undefined) {
			unavailableSources.push('Tempo');
			warnings.push('Tempo evidence collection skipped: trace id was not found in Loki evidence');
		}
		else {
			try {
				const tempo = await this.tempo.collect(traceId);
				tempoLink = tempo.link;
				rootCauseEvidence.push(...tempo.evidence);
			}
			catch (error) {
				unavailableSources.push('Tempo');
				warnings.push(`Tempo evidence collection failed: ${error instanceof Error ? error.message : 'unknown error'}`);
			}
		}

		const limitedRootCauseEvidence = rootCauseEvidence.slice(0, MAX_ROOT_CAUSE_EVIDENCE);
		const collectedEvidence: IncidentEvidencePacket = {
			keyMetrics: keyMetrics.slice(0, 5),
			rootCauseEvidence: limitedRootCauseEvidence,
			observations: limitedRootCauseEvidence.map(entry => entry.description),
			representativeMetricSummary: keyMetrics.length === 0 ? undefined : keyMetrics.map(metric => metric.interpretation).join(' '),
			representativeLogLink: lokiLink,
			representativeTraceLink: tempoLink,
			unavailableSources,
			collectionWarnings: warnings,
		};

		return {
			evidence: mergeEvidence(input.evidence, collectedEvidence),
			links: mergeLinks(input.links, {
				alertSourceUrl: input.incident.generatorUrl ?? undefined,
				lokiQueryUrl: lokiLink,
				tempoTraceUrl: tempoLink,
			}),
		};
	}
}
