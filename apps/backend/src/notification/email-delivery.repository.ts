import type { EmailDeliveryStatus, IncidentPacket } from './notification.types';

import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

export type EmailDeliveryRecordInput = {
	readonly incident: IncidentPacket;
	readonly dedupKey: string;
	readonly severity: string;
	readonly subject?: string;
	readonly recipients: readonly string[];
	readonly status: EmailDeliveryStatus;
	readonly failureReason?: string;
	readonly dedupSuppressed: boolean;
	readonly llmUsed: boolean;
	readonly fallbackUsed: boolean;
	readonly sentAt?: Date;
};

@Injectable()
export class EmailDeliveryRepository {
	public constructor(private readonly prisma: PrismaService) {}

	public async hasSentRecord(fingerprint: string, dedupKey: string): Promise<boolean> {
		const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
			`SELECT id
			 FROM email_delivery_records
			 WHERE fingerprint = $1
			 AND dedup_key = $2
			 AND status = 'sent'
			 AND dedup_suppressed = false
			 LIMIT 1`,
			fingerprint,
			dedupKey,
		);

		return rows.length > 0;
	}

	public async insertRecord(input: EmailDeliveryRecordInput): Promise<void> {
		await this.prisma.$executeRawUnsafe(
			`INSERT INTO email_delivery_records (
				id,
				incident_id,
				incident_type,
				fingerprint,
				dedup_key,
				severity,
				service_name,
				subject,
				recipients,
				status,
				failure_reason,
				dedup_suppressed,
				llm_used,
				fallback_used,
				created_at,
				sent_at
			)
			VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, NOW(), $15
			)`,
			randomUUID(),
			input.incident.incidentId,
			input.incident.incidentType,
			input.incident.fingerprint,
			input.dedupKey,
			input.severity,
			input.incident.serviceName,
			input.subject ?? null,
			JSON.stringify(input.recipients),
			input.status,
			input.failureReason ?? null,
			input.dedupSuppressed,
			input.llmUsed,
			input.fallbackUsed,
			input.sentAt ?? null,
		);
	}
}
