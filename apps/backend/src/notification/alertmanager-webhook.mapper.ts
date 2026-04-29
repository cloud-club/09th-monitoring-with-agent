import type {
	AlertmanagerAlert,
	AlertmanagerAnnotations,
	AlertmanagerLabels,
	AlertmanagerMappedIncident,
	AlertmanagerMappingResult,
	AlertmanagerWebhookPayload,
} from './alertmanager-webhook.types';
import type { EmailNotifierConfig } from './notification.config';
import type { IncidentSeverity } from './notification.types';

import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { EMAIL_NOTIFIER_CONFIG } from './notification.tokens';

type IncidentMapping = {
	readonly incidentType: string;
	readonly serviceName: string;
};

const ALERT_NAME_MAPPING: Record<string, IncidentMapping> = {
	APIHighErrorRate: {
		incidentType: 'error_burst',
		serviceName: 'backend',
	},
	CheckoutLatencySpike: {
		incidentType: 'checkout_latency_spike',
		serviceName: 'checkout',
	},
	PaymentFailureSpike: {
		incidentType: 'payment_failure',
		serviceName: 'payment',
	},
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toStringMap(value: unknown): Record<string, string | undefined> {
	if (!isRecord(value)) {
		return {};
	}

	const result: Record<string, string | undefined> = {};
	for (const [key, entry] of Object.entries(value)) {
		result[key] = typeof entry === 'string' ? entry : undefined;
	}

	return result;
}

function normalizePayload(payload: unknown): AlertmanagerWebhookPayload {
	if (!isRecord(payload)) {
		return {};
	}

	const alerts = Array.isArray(payload.alerts)
		? payload.alerts
				.filter(isRecord)
				.map(alert => ({
					status: typeof alert.status === 'string' ? alert.status : undefined,
					labels: toStringMap(alert.labels),
					annotations: toStringMap(alert.annotations),
					startsAt: typeof alert.startsAt === 'string' ? alert.startsAt : undefined,
					endsAt: typeof alert.endsAt === 'string' ? alert.endsAt : undefined,
					generatorURL: typeof alert.generatorURL === 'string' ? alert.generatorURL : undefined,
					fingerprint: typeof alert.fingerprint === 'string' ? alert.fingerprint : undefined,
				}))
		: [];

	return {
		version: typeof payload.version === 'string' ? payload.version : undefined,
		groupKey: typeof payload.groupKey === 'string' ? payload.groupKey : undefined,
		status: typeof payload.status === 'string' ? payload.status : undefined,
		receiver: typeof payload.receiver === 'string' ? payload.receiver : undefined,
		externalURL: typeof payload.externalURL === 'string' ? payload.externalURL : undefined,
		groupLabels: toStringMap(payload.groupLabels),
		commonLabels: toStringMap(payload.commonLabels),
		commonAnnotations: toStringMap(payload.commonAnnotations),
		alerts,
	};
}

function normalizeSeverity(value: string | undefined): IncidentSeverity {
	const normalized = value?.trim().toLowerCase();
	if (
		normalized === 'critical'
		|| normalized === 'high'
		|| normalized === 'medium'
		|| normalized === 'low'
		|| normalized === 'info'
		|| normalized === 'warning'
	) {
		return normalized;
	}

	return 'high';
}

function stableFingerprint(alert: AlertmanagerAlert, alertName: string): string {
	const hash = createHash('sha256');
	hash.update(JSON.stringify({
		alertName,
		labels: alert.labels ?? {},
		startsAt: alert.startsAt ?? '',
	}));
	return hash.digest('hex').slice(0, 16);
}

function detectedAt(alert: AlertmanagerAlert): string {
	const startsAt = alert.startsAt?.trim();
	return startsAt === undefined || startsAt.length === 0 ? new Date().toISOString() : startsAt;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
	return values.find(value => value !== undefined && value.trim().length > 0)?.trim();
}

function evidenceFromAnnotations(
	alertAnnotations: AlertmanagerAnnotations | undefined,
	commonAnnotations: AlertmanagerAnnotations | undefined,
): readonly string[] | undefined {
	const observations = [
		firstNonEmpty(alertAnnotations?.summary, commonAnnotations?.summary),
		firstNonEmpty(alertAnnotations?.description, commonAnnotations?.description),
	].filter((value): value is string => value !== undefined);

	return observations.length === 0 ? undefined : [...new Set(observations)];
}

@Injectable()
export class AlertmanagerWebhookMapper {
	public constructor(
		@Inject(EMAIL_NOTIFIER_CONFIG)
		private readonly config: EmailNotifierConfig,
	) {}

	public mapPayload(payload: unknown): AlertmanagerMappingResult {
		const normalized = normalizePayload(payload);
		const incidents: AlertmanagerMappedIncident[] = [];
		let ignored = 0;

		for (const alert of normalized.alerts ?? []) {
			const alertStatus = alert.status ?? normalized.status;
			if (alertStatus !== 'firing') {
				ignored += 1;
				continue;
			}

			const labels: AlertmanagerLabels = {
				...(normalized.groupLabels ?? {}),
				...(normalized.commonLabels ?? {}),
				...(alert.labels ?? {}),
			};
			const alertName = firstNonEmpty(labels.alertname);
			if (alertName === undefined) {
				ignored += 1;
				continue;
			}

			const mappedIncidentType = firstNonEmpty(labels.incident_type) ?? ALERT_NAME_MAPPING[alertName]?.incidentType;
			if (
				mappedIncidentType === undefined
				|| !this.config.alertmanager.supportedIncidentTypes.includes(mappedIncidentType)
			) {
				ignored += 1;
				continue;
			}

			const serviceName = firstNonEmpty(labels.service, labels.service_name)
				?? ALERT_NAME_MAPPING[alertName]?.serviceName
				?? 'backend';
			const fingerprint = firstNonEmpty(alert.fingerprint) ?? stableFingerprint(alert, alertName);
			const alertSourceUrl = firstNonEmpty(alert.generatorURL, normalized.externalURL);
			const observations = evidenceFromAnnotations(alert.annotations, normalized.commonAnnotations);
			const evidence = observations === undefined
				? undefined
				: {
						observations,
					};

			incidents.push({
				alertName,
				input: {
					incident: {
						incidentId: `alertmanager:${alertName}:${fingerprint}:${detectedAt(alert)}`,
						incidentType: mappedIncidentType,
						severity: normalizeSeverity(labels.severity),
						serviceName,
						detectedAt: detectedAt(alert),
						fingerprint,
						source: 'alertmanager',
						generatorUrl: alertSourceUrl,
					},
					links: {
						alertSourceUrl,
					},
					evidence,
				},
			});
		}

		return { incidents, ignored };
	}
}
