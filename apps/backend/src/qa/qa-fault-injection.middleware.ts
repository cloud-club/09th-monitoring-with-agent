import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { Injectable } from '@nestjs/common';

import { fail } from '../http/contracts';
import { ERROR_CODES } from '../http/error-codes';

const FAULT_HEADER = 'x-mwa-fault';
const FAULT_DELAY_HEADER = 'x-mwa-fault-delay-ms';
const DEFAULT_FAULT_DELAY_MS = 1_000;
const MAX_FAULT_HOLD_MS = 10 * 60 * 1_000;

type FaultMode = 'delay' | 'error' | 'health-5xx' | 'metrics-off' | 'timeout' | 'unhandled';

let metricsDisabledUntilMs = 0;
let healthFailedUntilMs = 0;

const ALLOWED_FAULT_PATHS = [
	/^\/api\/search$/,
	/^\/api\/cart\/items$/,
	/^\/api\/orders$/,
	/^\/api\/orders\/[^/?#]+\/payment-attempts$/,
	/^\/health$/,
	/^\/metrics$/,
];

function isFaultInjectionEnabled(): boolean {
	return process.env.QA_FAULT_INJECTION_ENABLED === 'true';
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
	if (typeof value === 'string') {
		const trimmedValue = value.trim();
		return trimmedValue.length > 0 ? trimmedValue : undefined;
	}

	if (Array.isArray(value)) {
		return value.find((entry) => entry.trim().length > 0)?.trim();
	}

	return undefined;
}

function parseFaultMode(value: string | undefined): FaultMode | undefined {
	if (
		value === 'delay'
		|| value === 'error'
		|| value === 'health-5xx'
		|| value === 'metrics-off'
		|| value === 'timeout'
		|| value === 'unhandled'
	) {
		return value;
	}

	return undefined;
}

function parseDelayMs(value: string | undefined): number {
	const parsed = Number(value ?? DEFAULT_FAULT_DELAY_MS);
	if (!Number.isFinite(parsed)) {
		return DEFAULT_FAULT_DELAY_MS;
	}

	return Math.max(0, Math.min(Math.trunc(parsed), MAX_FAULT_HOLD_MS));
}

function isAllowedPath(path: string): boolean {
	return ALLOWED_FAULT_PATHS.some((pattern) => pattern.test(path));
}

function writeFaultResponse(response: Response, statusCode: number, message: string): void {
	response.locals.log_error_code = ERROR_CODES.INTERNAL_SERVER_ERROR;
	response.status(statusCode).json(fail(ERROR_CODES.INTERNAL_SERVER_ERROR, message));
}

@Injectable()
export class QaFaultInjectionMiddleware implements NestMiddleware {
	public use(request: Request, response: Response, next: NextFunction): void {
		const now = Date.now();

		if (request.path === '/metrics' && metricsDisabledUntilMs > now) {
			writeFaultResponse(response, 503, 'QA fault injection disabled metrics endpoint');
			return;
		}

		if (request.path === '/health' && healthFailedUntilMs > now) {
			writeFaultResponse(response, 500, 'QA fault injection forced health failure');
			return;
		}

		if (!isFaultInjectionEnabled() || !isAllowedPath(request.path)) {
			next();
			return;
		}

		const mode = parseFaultMode(getHeaderValue(request.headers[FAULT_HEADER]));
		if (mode === undefined) {
			next();
			return;
		}

		const delayMs = parseDelayMs(getHeaderValue(request.headers[FAULT_DELAY_HEADER]));

		if (mode === 'delay') {
			setTimeout(next, delayMs);
			return;
		}

		if (mode === 'timeout') {
			setTimeout(() => {
				writeFaultResponse(response, 504, 'QA fault injection simulated timeout');
			}, delayMs);
			return;
		}

		if (mode === 'health-5xx') {
			healthFailedUntilMs = Date.now() + Math.max(delayMs, DEFAULT_FAULT_DELAY_MS);
			writeFaultResponse(response, 500, 'QA fault injection forced health failure');
			return;
		}

		if (mode === 'metrics-off') {
			metricsDisabledUntilMs = Date.now() + Math.max(delayMs, DEFAULT_FAULT_DELAY_MS);
			writeFaultResponse(response, 503, 'QA fault injection disabled metrics endpoint');
			return;
		}

		if (mode === 'unhandled') {
			throw new Error('QA fault injection unhandled exception');
		}

		writeFaultResponse(response, 500, 'QA fault injection forced error');
	}
}
