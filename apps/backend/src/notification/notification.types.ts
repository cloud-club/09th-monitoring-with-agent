export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical' | 'info' | 'warning';

export type IncidentPacket = {
	readonly incidentId: string;
	readonly incidentType: string;
	readonly severity: IncidentSeverity;
	readonly serviceName: string;
	readonly detectedAt: string | Date;
	readonly fingerprint: string;
	readonly source: string;
	readonly generatorUrl?: string | null;
};

export type DiagnosisCause = {
	readonly cause: string;
	readonly confidence?: 'low' | 'medium' | 'high';
	readonly priority?: number;
	readonly reason?: string;
};

export type DiagnosisResult = {
	readonly summary: string;
	readonly customerImpact: string;
	readonly confirmedEvidence: readonly string[];
	readonly likelyCauses: readonly DiagnosisCause[];
	readonly immediateActions: readonly string[];
	readonly followupChecks: readonly string[];
	readonly incidentTypeKo?: string;
	readonly emailSubject?: string;
	readonly finalSeverity?: IncidentSeverity;
};

export type IncidentDrilldownLinks = {
	readonly grafanaDashboardUrl?: string;
	readonly lokiQueryUrl?: string;
	readonly tempoTraceUrl?: string;
	readonly alertSourceUrl?: string;
};

export type IncidentMetricEvidence = {
	readonly name: string;
	readonly query: string;
	readonly value: number | string;
	readonly unit?: string;
	readonly interpretation: string;
	readonly source: 'prometheus';
};

export type IncidentRootCauseEvidence = {
	readonly source: 'loki' | 'prometheus' | 'tempo';
	readonly description: string;
	readonly relatedCause?: string;
	readonly traceId?: string;
	readonly logSample?: string;
	readonly metricName?: string;
};

export type IncidentEvidencePacket = {
	readonly representativeMetricSummary?: string;
	readonly representativeLogLink?: string;
	readonly representativeTraceLink?: string;
	readonly observations?: readonly string[];
	readonly keyMetrics?: readonly IncidentMetricEvidence[];
	readonly rootCauseEvidence?: readonly IncidentRootCauseEvidence[];
	readonly unavailableSources?: readonly string[];
	readonly collectionWarnings?: readonly string[];
};

export type RenderedEmailReport = {
	readonly subject: string;
	readonly textBody: string;
	readonly htmlBody: string;
	readonly fallbackUsed: boolean;
};

export type EmailDeliveryStatus = 'sent' | 'suppressed' | 'failed';

export type EmailDeliveryResult = {
	readonly status: EmailDeliveryStatus;
	readonly incidentId: string;
	readonly fingerprint: string;
	readonly dedupKey: string;
	readonly recipients: readonly string[];
	readonly subject?: string;
	readonly reason?: string;
	readonly dedupSuppressed: boolean;
	readonly llmUsed: boolean;
	readonly fallbackUsed: boolean;
	readonly sentAt?: Date;
};

export type NotifyIncidentInput = {
	readonly incident: IncidentPacket;
	readonly diagnosis?: DiagnosisResult;
	readonly links?: IncidentDrilldownLinks;
	readonly evidence?: IncidentEvidencePacket;
};

export type EmailMessage = {
	readonly from: string;
	readonly to: readonly string[];
	readonly subject: string;
	readonly text: string;
	readonly html: string;
};

export type EmailTransportResult = {
	readonly accepted: boolean;
	readonly providerMessageId?: string;
	readonly failureReason?: string;
};

export type EmailTransport = {
	send: (message: EmailMessage) => Promise<EmailTransportResult>;
};

export type DiagnosisResolution = {
	readonly diagnosis: DiagnosisResult;
	readonly llmUsed: boolean;
	readonly fallbackUsed: boolean;
	readonly failureReason?: string;
};
