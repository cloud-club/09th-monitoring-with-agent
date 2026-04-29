import type { NotifyIncidentInput } from './notification.types';

export type AlertmanagerLabels = Record<string, string | undefined>;

export type AlertmanagerAnnotations = Record<string, string | undefined>;

export type AlertmanagerAlert = {
	readonly status?: string;
	readonly labels?: AlertmanagerLabels;
	readonly annotations?: AlertmanagerAnnotations;
	readonly startsAt?: string;
	readonly endsAt?: string;
	readonly generatorURL?: string;
	readonly fingerprint?: string;
};

export type AlertmanagerWebhookPayload = {
	readonly version?: string;
	readonly groupKey?: string;
	readonly status?: string;
	readonly receiver?: string;
	readonly externalURL?: string;
	readonly groupLabels?: AlertmanagerLabels;
	readonly commonLabels?: AlertmanagerLabels;
	readonly commonAnnotations?: AlertmanagerAnnotations;
	readonly alerts?: readonly AlertmanagerAlert[];
};

export type AlertmanagerMappedIncident = {
	readonly input: NotifyIncidentInput;
	readonly alertName: string;
};

export type AlertmanagerMappingResult = {
	readonly incidents: readonly AlertmanagerMappedIncident[];
	readonly ignored: number;
};

export type AlertmanagerWebhookResponse = {
	readonly accepted: number;
	readonly ignored: number;
	readonly queued: number;
};
