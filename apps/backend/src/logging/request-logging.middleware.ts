import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import process from 'node:process';

import { Inject, Injectable } from '@nestjs/common';

import { AppLoggerService } from './app-logger.service';

function deriveRequestResult(statusCode: number, errorCode: string | undefined): string {
	if (errorCode === 'VALIDATION_ERROR') {
		return 'validation_error';
	}

	if (errorCode === 'STATE_CONFLICT') {
		return 'conflict';
	}

	if (statusCode >= 200 && statusCode < 400) {
		return 'success';
	}

	return 'error';
}

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
	public constructor(@Inject(AppLoggerService) private readonly appLogger: AppLoggerService) {}

	public use(request: Request, response: Response, next: NextFunction): void {
		const startTime = process.hrtime.bigint();

		response.on('finish', () => {
			const errorCode = typeof response.locals.log_error_code === 'string' ? response.locals.log_error_code : undefined;
			const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;

			this.appLogger.logRequest({
				request,
				result: deriveRequestResult(response.statusCode, errorCode),
				errorCode,
				fields: {
					duration_ms: Number(durationMs.toFixed(3)),
					status_code: response.statusCode,
				},
			});
		});

		next();
	}
}
