import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { isSpanContextValid, SpanStatusCode } from '@opentelemetry/api';

import { getRequestEndpoint } from '../logging/request-endpoint';
import { setRequestTraceId } from '../request-context/request-context';

import { getBackendTracer } from './opentelemetry';

const TRACE_ID_HEADER = 'x-trace-id';

function createFallbackTraceId(): string {
	return randomBytes(16).toString('hex');
}

@Injectable()
export class HttpTraceMiddleware implements NestMiddleware {
	public use(request: Request, response: Response, next: NextFunction): void {
		const span = getBackendTracer().startSpan(`HTTP ${request.method}`);
		const spanContext = span.spanContext();
		const traceId = isSpanContextValid(spanContext) ? spanContext.traceId : createFallbackTraceId();

		setRequestTraceId(request, traceId);
		response.setHeader(TRACE_ID_HEADER, traceId);

		let ended = false;
		const endSpan = (): void => {
			if (ended) {
				return;
			}

			ended = true;
			span.setAttribute('http.request.method', request.method);
			span.setAttribute('http.route', getRequestEndpoint(request));
			span.setAttribute('http.response.status_code', response.statusCode);
			span.setAttribute('url.path', request.path);

			if (response.statusCode >= 500) {
				span.setStatus({ code: SpanStatusCode.ERROR });
			}

			span.end();
		};

		response.on('finish', endSpan);
		response.on('close', endSpan);
		next();
	}
}
