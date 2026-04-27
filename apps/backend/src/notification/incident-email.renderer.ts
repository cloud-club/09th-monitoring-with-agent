import type {
	DiagnosisCause,
	DiagnosisResult,
	IncidentDrilldownLinks,
	IncidentEvidencePacket,
	IncidentPacket,
	IncidentSeverity,
	RenderedEmailReport,
} from './notification.types';

import { Injectable } from '@nestjs/common';

type RenderInput = {
	readonly incident: IncidentPacket;
	readonly diagnosis: DiagnosisResult;
	readonly links?: IncidentDrilldownLinks;
	readonly evidence?: IncidentEvidencePacket;
	readonly fallbackUsed: boolean;
};

const MAX_SUMMARY_SENTENCES = 3;
const MAX_LIST_ITEMS = 3;
const MAX_CAUSES = 2;
const MAX_EVIDENCE_ITEMS = 5;
const MAX_ITEM_LENGTH = 220;

const INCIDENT_TYPE_KO_BY_TYPE: Record<string, string> = {
	checkout_latency_spike: '체크아웃 응답 지연 급증',
	error_burst: '에러 급증',
	payment_failure: '결제 실패율 증가',
};

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll('\'', '&#39;');
}

function maskSensitiveText(value: string): string {
	return value
		.replace(/\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[masked-email]')
		.replace(/\b(Bearer|Basic)\s+[\w.~+/-]+=*/gi, '$1 [masked-token]')
		.replace(/\b(api[_-]?key|token|password|secret)=[^&\s]+/gi, '$1=[masked]')
		.replace(/\b[\w-]{32,}\b/g, '[masked-token]');
}

function sanitizeUrl(value: string): string {
	try {
		const url = new URL(value);
		for (const [key, currentValue] of url.searchParams.entries()) {
			const normalizedKey = key.toLowerCase();
			if (
				normalizedKey.includes('token')
				|| normalizedKey.includes('secret')
				|| normalizedKey.includes('password')
				|| normalizedKey.includes('key')
				|| currentValue.length > 120
			) {
				url.searchParams.set(key, '[masked]');
			}
		}

		return url.toString();
	}
	catch {
		return maskSensitiveText(value);
	}
}

function truncateText(value: string, maxLength: number = MAX_ITEM_LENGTH): string {
	const sanitized = maskSensitiveText(value.trim());
	if (sanitized.length <= maxLength) {
		return sanitized;
	}

	return `${sanitized.slice(0, maxLength - 1)}…`;
}

function limitList(items: readonly string[], limit: number = MAX_LIST_ITEMS): readonly string[] {
	return items.slice(0, limit).map(item => truncateText(item));
}

function limitSummary(value: string): string {
	const sanitized = maskSensitiveText(value.trim());
	const sentences = sanitized
		.split(/(?<=[.!?。！？])\s+/)
		.filter(sentence => sentence.length > 0);
	const limited = sentences.length > 0 ? sentences.slice(0, MAX_SUMMARY_SENTENCES).join(' ') : sanitized;
	return truncateText(limited, 420);
}

function firstSentence(value: string): string {
	const summary = limitSummary(value);
	const match = /.*?[.!?。！？](?:\s|$)/.exec(summary);
	return truncateText(match?.[0].trim() ?? summary, 120);
}

function severityLabel(severity: IncidentSeverity): string {
	return severity.toUpperCase();
}

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

function formatDate(value: string | Date): string {
	const date = value instanceof Date ? value : new Date(value);
	if (!Number.isFinite(date.getTime())) {
		return String(value);
	}

	const parts = new Intl.DateTimeFormat('en-US', {
		day: '2-digit',
		hour: '2-digit',
		hour12: false,
		minute: '2-digit',
		month: '2-digit',
		second: '2-digit',
		timeZone: 'Asia/Seoul',
		year: 'numeric',
	}).formatToParts(date);
	const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find(part => part.type === type)?.value ?? '00';

	return `${get('year')}-${pad(Number(get('month')))}-${pad(Number(get('day')))} ${pad(Number(get('hour')))}:${pad(Number(get('minute')))}:${pad(Number(get('second')))} KST`;
}

function humanizeIncidentType(value: string): string {
	const humanized = value
		.replaceAll('_', ' ')
		.replaceAll('-', ' ')
		.trim();
	return humanized.length > 0 ? humanized : value;
}

function resolveIncidentTypeKo(incident: IncidentPacket, diagnosis: DiagnosisResult): string {
	const candidate = diagnosis.incidentTypeKo?.trim();
	if (candidate !== undefined && candidate.length > 0) {
		return truncateText(candidate, 80);
	}

	return INCIDENT_TYPE_KO_BY_TYPE[incident.incidentType] ?? humanizeIncidentType(incident.incidentType);
}

function normalizeSubjectSummary(value: string, serviceName: string, incidentTypeKo: string): string {
	let normalized = maskSensitiveText(value.trim());
	normalized = normalized.replace(/^\[[^\]]+\]\s*/u, '').trim();
	const slashIndex = normalized.lastIndexOf('/');
	if (slashIndex !== -1) {
		normalized = normalized.slice(slashIndex + 1).trim();
	}

	normalized = normalized.replace(new RegExp(`^${escapeRegExp(serviceName)}\\s*-\\s*`, 'iu'), '').trim();
	normalized = normalized.replace(new RegExp(`^${escapeRegExp(incidentTypeKo)}\\s*[-/]\\s*`, 'iu'), '').trim();
	return truncateText(normalized, 120);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveOneLineSummary(diagnosis: DiagnosisResult, serviceName: string, incidentTypeKo: string): string {
	const subjectSummary = diagnosis.emailSubject === undefined
		? undefined
		: normalizeSubjectSummary(diagnosis.emailSubject, serviceName, incidentTypeKo);
	if (subjectSummary !== undefined && subjectSummary.length > 0 && subjectSummary !== incidentTypeKo) {
		return subjectSummary;
	}

	return firstSentence(diagnosis.summary);
}

function formatCause(cause: DiagnosisCause): readonly string[] {
	const confidence = cause.confidence ?? 'unknown';
	const rows = [`- ${truncateText(cause.cause)} (신뢰도: ${confidence})`];
	const reason = cause.reason === undefined || cause.reason.trim().length === 0
		? '확인된 근거를 바탕으로 한 원인 후보입니다.'
		: truncateText(cause.reason);
	return [...rows, `  근거: ${reason}`];
}

function listText(items: readonly string[], emptyText: string): string {
	if (items.length === 0) {
		return `- ${emptyText}`;
	}

	return items.map(item => `- ${item}`).join('\n');
}

function listHtml(items: readonly string[], emptyText: string): string {
	const values = items.length === 0 ? [emptyText] : items;
	return `<ul>${values.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function causeText(causes: readonly DiagnosisCause[]): string {
	if (causes.length === 0) {
		return '- 원인 후보가 충분히 특정되지 않았습니다.';
	}

	return causes.slice(0, MAX_CAUSES).flatMap(formatCause).join('\n');
}

function causeHtml(causes: readonly DiagnosisCause[]): string {
	if (causes.length === 0) {
		return '<ul><li>원인 후보가 충분히 특정되지 않았습니다.</li></ul>';
	}

	return `<ul>${causes.slice(0, MAX_CAUSES).map((cause) => {
		const confidence = cause.confidence ?? 'unknown';
		const reason = cause.reason === undefined || cause.reason.trim().length === 0
			? '확인된 근거를 바탕으로 한 원인 후보입니다.'
			: truncateText(cause.reason);
		return `<li>${escapeHtml(truncateText(cause.cause))} (신뢰도: ${escapeHtml(confidence)})<br>근거: ${escapeHtml(reason)}</li>`;
	}).join('')}</ul>`;
}

function linkRows(incident: IncidentPacket, links?: IncidentDrilldownLinks, evidence?: IncidentEvidencePacket): readonly [string, string][] {
	return [
		['Grafana Dashboard', links?.grafanaDashboardUrl],
		['Loki Logs', links?.lokiQueryUrl ?? evidence?.representativeLogLink],
		['Tempo Trace', links?.tempoTraceUrl ?? evidence?.representativeTraceLink],
		['Alert Source', links?.alertSourceUrl ?? incident.generatorUrl ?? undefined],
	]
		.filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
		.map(([label, url]) => [label, sanitizeUrl(url)]);
}

function referenceText(rows: readonly [string, string][]): string {
	if (rows.length === 0) {
		return '- 제공된 참조 링크 없음';
	}

	return rows.map(([label, url]) => `- ${label}: ${url}`).join('\n');
}

function referenceHtml(rows: readonly [string, string][]): string {
	if (rows.length === 0) {
		return '<ul><li>제공된 참조 링크 없음</li></ul>';
	}

	return `<ul>${rows.map(([label, url]) => `<li>${escapeHtml(label)}: <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`).join('')}</ul>`;
}

function keyMetricRows(evidence?: IncidentEvidencePacket): readonly string[] {
	return (evidence?.keyMetrics ?? [])
		.slice(0, MAX_EVIDENCE_ITEMS)
		.map((metric) => {
			const unit = metric.unit === undefined ? '' : ` ${metric.unit}`;
			return `${metric.name}: ${metric.value}${unit} - ${metric.interpretation}`;
		});
}

function rootCauseEvidenceRows(evidence?: IncidentEvidencePacket): readonly string[] {
	return (evidence?.rootCauseEvidence ?? [])
		.slice(0, MAX_EVIDENCE_ITEMS)
		.map((entry) => {
			const trace = entry.traceId === undefined ? '' : ` / trace_id=${entry.traceId}`;
			const metric = entry.metricName === undefined ? '' : ` / metric=${entry.metricName}`;
			return `[${entry.source}] ${entry.description}${trace}${metric}`;
		});
}

function fallbackEvidenceRows(diagnosis: DiagnosisResult, evidence?: IncidentEvidencePacket): readonly string[] {
	return [
		...limitList(diagnosis.confirmedEvidence),
		...keyMetricRows(evidence),
		...rootCauseEvidenceRows(evidence),
	].slice(0, MAX_EVIDENCE_ITEMS);
}

function evidenceNotes(evidence?: IncidentEvidencePacket): readonly string[] {
	return [
		...(evidence?.unavailableSources ?? []).map(source => `${source} 증거는 수집되지 않았습니다.`),
		...(evidence?.collectionWarnings ?? []).map(warning => truncateText(warning)),
	];
}

function notesText(notes: readonly string[], fallbackUsed: boolean): string {
	const generationNote = fallbackUsed
		? 'LLM 분석 결과를 생성하지 못해 기본 incident 정보만 전달합니다.'
		: '본 리포트는 AIOps 분석 결과를 기반으로 자동 생성되었습니다.';
	const rows = [
		generationNote,
		fallbackUsed ? '상세 분석은 참조 링크에서 확인해 주세요.' : '\'확인된 근거\'와 \'원인 후보\'는 구분하여 검토해 주세요.',
		...notes,
	];

	return listText(rows, '추가 비고 없음');
}

function notesHtml(notes: readonly string[], fallbackUsed: boolean): string {
	const generationNote = fallbackUsed
		? 'LLM 분석 결과를 생성하지 못해 기본 incident 정보만 전달합니다.'
		: '본 리포트는 AIOps 분석 결과를 기반으로 자동 생성되었습니다.';
	const rows = [
		generationNote,
		fallbackUsed ? '상세 분석은 참조 링크에서 확인해 주세요.' : '\'확인된 근거\'와 \'원인 후보\'는 구분하여 검토해 주세요.',
		...notes,
	];

	return listHtml(rows, '추가 비고 없음');
}

@Injectable()
export class IncidentEmailRenderer {
	public render(input: RenderInput): RenderedEmailReport {
		const incidentTypeKo = resolveIncidentTypeKo(input.incident, input.diagnosis);
		const effectiveSeverity = input.diagnosis.finalSeverity ?? input.incident.severity;
		const oneLineSummary = resolveOneLineSummary(input.diagnosis, input.incident.serviceName, incidentTypeKo);
		const subject = `[${severityLabel(effectiveSeverity)}] ${input.incident.serviceName} - ${incidentTypeKo} / ${oneLineSummary}`;

		if (input.fallbackUsed) {
			return this.renderFallbackReport(input, subject, incidentTypeKo, effectiveSeverity);
		}

		return this.renderDiagnosisReport(input, subject, incidentTypeKo, effectiveSeverity);
	}

	public createFallbackDiagnosis(incident: IncidentPacket, evidence?: IncidentEvidencePacket): DiagnosisResult {
		const metricEvidence = evidence?.representativeMetricSummary === undefined ? [] : [truncateText(evidence.representativeMetricSummary)];
		const observations = limitList(evidence?.observations ?? []);
		const incidentTypeKo = INCIDENT_TYPE_KO_BY_TYPE[incident.incidentType] ?? humanizeIncidentType(incident.incidentType);

		return {
			summary: `${incident.serviceName}에서 ${incidentTypeKo} 유형의 ${severityLabel(incident.severity)} incident가 감지되었습니다.`,
			customerImpact: '사용자 영향은 아직 자동 분석으로 확정되지 않았습니다. 관련 대시보드와 로그를 우선 확인하세요.',
			confirmedEvidence: [...metricEvidence, ...observations],
			likelyCauses: [],
			immediateActions: ['Grafana 대시보드에서 영향 범위를 확인합니다.', 'Loki/Tempo 링크로 실패 요청과 지연 구간을 확인합니다.'],
			followupChecks: ['동일 fingerprint의 반복 발생 여부를 확인합니다.', '최근 배포 또는 인프라 변동 여부를 확인합니다.'],
			incidentTypeKo,
			finalSeverity: incident.severity,
		};
	}

	private renderDiagnosisReport(
		input: RenderInput,
		subject: string,
		incidentTypeKo: string,
		effectiveSeverity: IncidentSeverity,
	): RenderedEmailReport {
		const summary = limitSummary(input.diagnosis.summary);
		const customerImpact = truncateText(input.diagnosis.customerImpact, 420);
		const confirmedEvidence = limitList(input.diagnosis.confirmedEvidence);
		const keyMetrics = keyMetricRows(input.evidence);
		const rootCauseEvidence = rootCauseEvidenceRows(input.evidence);
		const immediateActions = limitList(input.diagnosis.immediateActions);
		const followupChecks = limitList(input.diagnosis.followupChecks);
		const links = linkRows(input.incident, input.links, input.evidence);
		const notes = evidenceNotes(input.evidence);

		const textBody = [
			`사건 ID: ${input.incident.incidentId}`,
			`탐지 시각: ${formatDate(input.incident.detectedAt)}`,
			`심각도: ${severityLabel(effectiveSeverity)}`,
			`영향 서비스: ${input.incident.serviceName}`,
			`사건 유형: ${incidentTypeKo}`,
			'',
			'1. 요약',
			summary,
			'',
			'2. 사용자 영향',
			customerImpact,
			'',
			'3. 확인된 근거',
			listText(confirmedEvidence, '확인된 근거가 제한적입니다. 참조 링크에서 원문을 확인하세요.'),
			'',
			'4. 핵심 지표',
			listText(keyMetrics, '수집된 핵심 지표가 없습니다. 참조 링크에서 원문을 확인하세요.'),
			'',
			'5. 원인 후보',
			causeText(input.diagnosis.likelyCauses),
			rootCauseEvidence.length === 0 ? '' : ['원인 분석 근거', listText(rootCauseEvidence, '원인 분석 근거가 제한적입니다.')].join('\n'),
			'',
			'6. 즉시 조치',
			listText(immediateActions, 'Grafana/Loki/Tempo 링크에서 영향 범위를 먼저 확인하세요.'),
			'',
			'7. 추가 확인 사항',
			listText(followupChecks, '추가 확인 사항이 제공되지 않았습니다.'),
			'',
			'8. 참조 링크',
			referenceText(links),
			'',
			'9. 비고',
			notesText(notes, false),
		].join('\n');

		const htmlBody = [
			'<!doctype html>',
			'<html><body>',
			'<table>',
			`<tr><th align="left">사건 ID</th><td>${escapeHtml(input.incident.incidentId)}</td></tr>`,
			`<tr><th align="left">탐지 시각</th><td>${escapeHtml(formatDate(input.incident.detectedAt))}</td></tr>`,
			`<tr><th align="left">심각도</th><td>${escapeHtml(severityLabel(effectiveSeverity))}</td></tr>`,
			`<tr><th align="left">영향 서비스</th><td>${escapeHtml(input.incident.serviceName)}</td></tr>`,
			`<tr><th align="left">사건 유형</th><td>${escapeHtml(incidentTypeKo)}</td></tr>`,
			'</table>',
			'<h2>1. 요약</h2>',
			`<p>${escapeHtml(summary)}</p>`,
			'<h2>2. 사용자 영향</h2>',
			`<p>${escapeHtml(customerImpact)}</p>`,
			'<h2>3. 확인된 근거</h2>',
			listHtml(confirmedEvidence, '확인된 근거가 제한적입니다. 참조 링크에서 원문을 확인하세요.'),
			'<h2>4. 핵심 지표</h2>',
			listHtml(keyMetrics, '수집된 핵심 지표가 없습니다. 참조 링크에서 원문을 확인하세요.'),
			'<h2>5. 원인 후보</h2>',
			causeHtml(input.diagnosis.likelyCauses),
			rootCauseEvidence.length === 0 ? '' : '<h3>원인 분석 근거</h3>',
			rootCauseEvidence.length === 0 ? '' : listHtml(rootCauseEvidence, '원인 분석 근거가 제한적입니다.'),
			'<h2>6. 즉시 조치</h2>',
			listHtml(immediateActions, 'Grafana/Loki/Tempo 링크에서 영향 범위를 먼저 확인하세요.'),
			'<h2>7. 추가 확인 사항</h2>',
			listHtml(followupChecks, '추가 확인 사항이 제공되지 않았습니다.'),
			'<h2>8. 참조 링크</h2>',
			referenceHtml(links),
			'<h2>9. 비고</h2>',
			notesHtml(notes, false),
			'</body></html>',
		].join('');

		return {
			subject,
			textBody,
			htmlBody,
			fallbackUsed: false,
		};
	}

	private renderFallbackReport(
		input: RenderInput,
		subject: string,
		incidentTypeKo: string,
		effectiveSeverity: IncidentSeverity,
	): RenderedEmailReport {
		const basicEvidence = fallbackEvidenceRows(input.diagnosis, input.evidence);
		const links = linkRows(input.incident, input.links, input.evidence);
		const notes = evidenceNotes(input.evidence);

		const textBody = [
			`사건 ID: ${input.incident.incidentId}`,
			`탐지 시각: ${formatDate(input.incident.detectedAt)}`,
			`심각도: ${severityLabel(effectiveSeverity)}`,
			`영향 서비스: ${input.incident.serviceName}`,
			`사건 유형: ${incidentTypeKo}`,
			'',
			'1. 기본 요약',
			limitSummary(input.diagnosis.summary),
			'',
			'2. 현재 확인된 정보',
			listText(basicEvidence, '현재 확인된 정보가 제한적입니다. 참조 링크에서 원문을 확인하세요.'),
			'',
			'3. 즉시 확인 링크',
			referenceText(links),
			'',
			'4. 비고',
			notesText(notes, true),
		].join('\n');

		const htmlBody = [
			'<!doctype html>',
			'<html><body>',
			'<table>',
			`<tr><th align="left">사건 ID</th><td>${escapeHtml(input.incident.incidentId)}</td></tr>`,
			`<tr><th align="left">탐지 시각</th><td>${escapeHtml(formatDate(input.incident.detectedAt))}</td></tr>`,
			`<tr><th align="left">심각도</th><td>${escapeHtml(severityLabel(effectiveSeverity))}</td></tr>`,
			`<tr><th align="left">영향 서비스</th><td>${escapeHtml(input.incident.serviceName)}</td></tr>`,
			`<tr><th align="left">사건 유형</th><td>${escapeHtml(incidentTypeKo)}</td></tr>`,
			'</table>',
			'<h2>1. 기본 요약</h2>',
			`<p>${escapeHtml(limitSummary(input.diagnosis.summary))}</p>`,
			'<h2>2. 현재 확인된 정보</h2>',
			listHtml(basicEvidence, '현재 확인된 정보가 제한적입니다. 참조 링크에서 원문을 확인하세요.'),
			'<h2>3. 즉시 확인 링크</h2>',
			referenceHtml(links),
			'<h2>4. 비고</h2>',
			notesHtml(notes, true),
			'</body></html>',
		].join('');

		return {
			subject,
			textBody,
			htmlBody,
			fallbackUsed: true,
		};
	}
}
