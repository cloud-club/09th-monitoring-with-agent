import type { EmailNotifierConfig } from './notification.config';

import type { DiagnosisResolution, NotifyIncidentInput } from './notification.types';
import { Inject, Injectable } from '@nestjs/common';
import { IncidentEmailRenderer } from './incident-email.renderer';
import { LocalLlmDiagnosisClient } from './local-llm-diagnosis.client';
import { EMAIL_NOTIFIER_CONFIG } from './notification.tokens';

@Injectable()
export class IncidentDiagnosisService {
	public constructor(
		@Inject(EMAIL_NOTIFIER_CONFIG)
		private readonly config: EmailNotifierConfig,
		private readonly llmClient: LocalLlmDiagnosisClient,
		private readonly renderer: IncidentEmailRenderer,
	) {}

	public async resolveDiagnosis(input: NotifyIncidentInput): Promise<DiagnosisResolution> {
		if (input.diagnosis !== undefined) {
			return {
				diagnosis: input.diagnosis,
				llmUsed: false,
				fallbackUsed: false,
			};
		}

		if (this.config.llm.enabled) {
			try {
				return {
					diagnosis: await this.llmClient.generateDiagnosis(input),
					llmUsed: true,
					fallbackUsed: false,
				};
			}
			catch (error) {
				return {
					diagnosis: this.renderer.createFallbackDiagnosis(input.incident, input.evidence),
					llmUsed: false,
					fallbackUsed: true,
					failureReason: error instanceof Error ? error.message : 'LLM diagnosis failed',
				};
			}
		}

		return {
			diagnosis: this.renderer.createFallbackDiagnosis(input.incident, input.evidence),
			llmUsed: false,
			fallbackUsed: true,
			failureReason: 'LLM diagnosis disabled',
		};
	}
}
