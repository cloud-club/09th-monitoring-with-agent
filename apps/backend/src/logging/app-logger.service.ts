import type { Request } from 'express';

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { getRequestTelemetryContext } from '../request-context/request-context';

import { getRequestEndpoint } from './request-endpoint';

type LogLevel = 'info' | 'warn' | 'error';

type StructuredLogRecord = {
	readonly timestamp: string;
	readonly level: LogLevel;
	readonly service: string;
	readonly environment: string;
	readonly request_id: string;
	readonly endpoint: string;
	readonly method: string;
	readonly result: string;
	readonly user_role?: string;
	readonly event_name?: string;
	readonly error_code?: string | null;
	readonly product_id?: string;
	readonly snapshot_id?: string;
	readonly variant_id?: string;
	readonly cart_id?: string;
	readonly order_id?: string;
	readonly payment_id?: string;
	readonly [key: string]: boolean | null | number | string | undefined;
};

type DomainEventInput = {
	readonly request: Request;
	readonly level?: LogLevel;
	readonly eventName: string;
	readonly result: string;
	readonly errorCode?: string | null;
	readonly fields?: Record<string, boolean | null | number | string | undefined>;
};

type RequestLogInput = {
	readonly request: Request;
	readonly level?: LogLevel;
	readonly result: string;
	readonly errorCode?: string | null;
	readonly fields?: Record<string, boolean | null | number | string | undefined>;
};

function omitUndefined(record: StructuredLogRecord): Record<string, boolean | null | number | string> {
	return Object.fromEntries(
		Object.entries(record).filter(([, value]) => value !== undefined),
	) as Record<string, boolean | null | number | string>;
}

@Injectable()
export class AppLoggerService {
	private readonly serviceName = process.env.SERVICE_NAME ?? 'mwa-backend';
	private readonly environment = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development';
	private readonly logDir = process.env.LOG_DIR ?? join(process.cwd(), 'logs');
	private readonly logFilePath = join(this.logDir, process.env.LOG_FILE_NAME ?? 'mwa-app.log');

	public constructor() {
		mkdirSync(this.logDir, { recursive: true });
	}

	private write(record: StructuredLogRecord): void {
		const serialized = JSON.stringify(omitUndefined(record));
		console.log(serialized);

		try {
			appendFileSync(this.logFilePath, `${serialized}\n`, 'utf8');
		} catch {
			// Logging must not break request handling; stdout remains the fallback sink.
		}
	}

	public logDomainEvent(input: DomainEventInput): void {
		const telemetry = getRequestTelemetryContext(input.request);
		this.write({
			timestamp: new Date().toISOString(),
			level: input.level ?? 'info',
			service: this.serviceName,
			environment: this.environment,
			request_id: telemetry.requestId,
			endpoint: getRequestEndpoint(input.request),
			method: input.request.method,
			result: input.result,
			user_role: telemetry.userRole,
			event_name: input.eventName,
			error_code: input.errorCode ?? null,
			...(input.fields ?? {}),
		});
	}

	public logRequest(input: RequestLogInput): void {
		const telemetry = getRequestTelemetryContext(input.request);
		this.write({
			timestamp: new Date().toISOString(),
			level: input.level ?? 'info',
			service: this.serviceName,
			environment: this.environment,
			request_id: telemetry.requestId,
			endpoint: getRequestEndpoint(input.request),
			method: input.request.method,
			result: input.result,
			user_role: telemetry.userRole,
			error_code: input.errorCode ?? null,
			...(input.fields ?? {}),
		});
	}
}
