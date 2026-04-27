import type { LoggerService } from '@nestjs/common';

import type { Request } from 'express';
import { appendFileSync, mkdirSync } from 'node:fs';

import { join } from 'node:path';
import process from 'node:process';
import { Injectable } from '@nestjs/common';

import { refreshLogHeartbeatMetric } from '../metrics/metrics-registry';
import { getRequestTelemetryContext } from '../request-context/request-context';

import { getRequestEndpoint } from './request-endpoint';

type LogLevel = 'debug' | 'error' | 'info' | 'verbose' | 'warn';

type LogFieldValue = boolean | null | number | string | undefined;

type StructuredLogRecord = {
	readonly timestamp: string;
	readonly level: LogLevel;
	readonly service: string;
	readonly environment: string;
	readonly request_id: string;
	readonly trace_id?: string;
	readonly endpoint: string;
	readonly method: string;
	readonly result: string;
	readonly user_role?: string;
	readonly customer_id?: string;
	readonly event_name?: string;
	readonly error_code?: string | null;
	readonly log_context?: string;
	readonly product_id?: string;
	readonly snapshot_id?: string;
	readonly variant_id?: string;
	readonly cart_id?: string;
	readonly order_id?: string;
	readonly payment_id?: string;
	readonly [key: string]: LogFieldValue;
};

type DomainEventInput = {
	readonly request: Request;
	readonly level?: LogLevel;
	readonly eventName: string;
	readonly result: string;
	readonly errorCode?: string | null;
	readonly fields?: Record<string, LogFieldValue>;
};

type RequestLogInput = {
	readonly request: Request;
	readonly level?: LogLevel;
	readonly result: string;
	readonly errorCode?: string | null;
	readonly fields?: Record<string, LogFieldValue>;
};

type SystemLogInput = {
	readonly level?: LogLevel;
	readonly eventName: string;
	readonly result: string;
	readonly errorCode?: string | null;
	readonly fields?: Record<string, LogFieldValue>;
};

function omitUndefined(record: StructuredLogRecord): Record<string, boolean | null | number | string> {
	return Object.fromEntries(
		Object.entries(record).filter(([, value]) => value !== undefined),
	) as Record<string, boolean | null | number | string>;
}

@Injectable()
export class AppLoggerService implements LoggerService {
	private readonly serviceName = process.env.SERVICE_NAME ?? 'mwa-backend';
	private readonly environment = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development';
	private readonly logDir = process.env.LOG_DIR ?? join(process.cwd(), 'logs');
	private readonly logFilePath = join(this.logDir, process.env.LOG_FILE_NAME ?? 'mwa-app.log');

	public constructor() {
		mkdirSync(this.logDir, { recursive: true });
	}

	public log(message: unknown, context?: string): void {
		this.writeNestLog('info', message, context);
	}

	public error(message: unknown, stack?: string, context?: string): void {
		this.writeNestLog('error', message, context, stack);
	}

	public warn(message: unknown, context?: string): void {
		this.writeNestLog('warn', message, context);
	}

	public debug(message: unknown, context?: string): void {
		this.writeNestLog('debug', message, context);
	}

	public verbose(message: unknown, context?: string): void {
		this.writeNestLog('verbose', message, context);
	}

	private write(record: StructuredLogRecord): void {
		refreshLogHeartbeatMetric();
		const serialized = JSON.stringify(omitUndefined(record));
		process.stdout.write(`${serialized}\n`);

		try {
			appendFileSync(this.logFilePath, `${serialized}\n`, 'utf8');
		}
		catch {
			// Logging must not break request handling; stdout remains the fallback sink.
		}
	}

	private stringifyMessage(message: unknown): string {
		if (typeof message === 'string') {
			return message;
		}

		if (message instanceof Error) {
			return message.message;
		}

		try {
			return JSON.stringify(message);
		}
		catch {
			return String(message);
		}
	}

	private writeNestLog(level: LogLevel, message: unknown, context?: string, stack?: string): void {
		this.write({
			timestamp: new Date().toISOString(),
			level,
			service: this.serviceName,
			environment: this.environment,
			request_id: 'system',
			endpoint: 'system',
			method: 'SYSTEM',
			result: 'log',
			user_role: 'anonymous',
			log_context: context,
			stack,
			event_name: 'system.log',
			message: this.stringifyMessage(message),
		});
	}

	public logDomainEvent(input: DomainEventInput): void {
		const telemetry = getRequestTelemetryContext(input.request);

		this.write({
			timestamp: new Date().toISOString(),
			level: input.level ?? 'info',
			service: this.serviceName,
			environment: this.environment,
			request_id: telemetry.requestId,
			trace_id: telemetry.traceId,
			endpoint: getRequestEndpoint(input.request),
			method: input.request.method,
			result: input.result,
			user_role: telemetry.userRole,
			customer_id: telemetry.customerId ?? '',
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
			trace_id: telemetry.traceId,
			endpoint: getRequestEndpoint(input.request),
			method: input.request.method,
			result: input.result,
			user_role: telemetry.userRole,
			customer_id: telemetry.customerId ?? '',
			error_code: input.errorCode ?? null,
			...(input.fields ?? {}),
		});
	}

	public logSystemEvent(input: SystemLogInput): void {
		this.write({
			timestamp: new Date().toISOString(),
			level: input.level ?? 'info',
			service: this.serviceName,
			environment: this.environment,
			request_id: 'system',
			endpoint: 'system',
			method: 'SYSTEM',
			result: input.result,
			user_role: 'anonymous',
			event_name: input.eventName,
			error_code: input.errorCode ?? null,
			...(input.fields ?? {}),
		});
	}
}
