import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { Injectable } from '@nestjs/common';

import { getRequestTelemetryContext } from '../request-context/request-context';
import { observeHttpRequest } from './metrics-registry';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
	public use(request: Request, response: Response, next: NextFunction): void {
		response.on('finish', () => {
			const route = request.route as { path?: unknown } | undefined;
			const routePath = route?.path;
			const telemetryContext = getRequestTelemetryContext(request);

			observeHttpRequest({
				method: request.method,
				path: typeof routePath === 'string' ? routePath : request.path,
				statusCode: response.statusCode,
				userRole: telemetryContext.userRole,
				requestId: telemetryContext.requestId,
			});
		});

		next();
	}
}
