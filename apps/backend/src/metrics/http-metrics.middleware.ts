import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { Injectable } from '@nestjs/common';

import { observeHttpRequest } from './metrics-registry';

const UUID_SEGMENT_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function normalizeHandlerPath(path: string): string {
	return path.replace(UUID_SEGMENT_PATTERN, ':id');
}

function toRouteHandler(request: Request): string {
	const route = request.route as { path?: unknown } | undefined;
	const routePath = typeof route?.path === 'string' ? route.path : request.path;
	const baseUrl = request.baseUrl;

	if (baseUrl.length === 0) {
		return normalizeHandlerPath(routePath);
	}

	if (routePath === '/') {
		return normalizeHandlerPath(baseUrl);
	}

	return normalizeHandlerPath(`${baseUrl}${routePath}`);
}

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
	public use(request: Request, response: Response, next: NextFunction): void {
		const startTime = process.hrtime.bigint();

		response.on('finish', () => {
			observeHttpRequest({
				method: request.method,
				handler: toRouteHandler(request),
				statusCode: response.statusCode,
				durationSeconds: Number(process.hrtime.bigint() - startTime) / 1_000_000_000,
			});
		});

		next();
	}
}
