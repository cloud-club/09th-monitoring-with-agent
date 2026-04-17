import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

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
		response.on('finish', () => {
			const errorCode = typeof response.locals.log_error_code === 'string' ? response.locals.log_error_code : undefined;

			this.appLogger.logRequest({
				request,
				result: deriveRequestResult(response.statusCode, errorCode),
				errorCode,
				fields: {
					status_code: response.statusCode,
				},
			});
		});

		next();
	}
}
