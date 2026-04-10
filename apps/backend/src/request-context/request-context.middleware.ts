import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import {
	createAnonymousRequestContext,
	getHeaderValue,
	REQUEST_ID_HEADER,
	setRequestContext,
} from './request-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
	public use(request: Request, response: Response, next: NextFunction): void {
		const requestId = getHeaderValue(request.headers[REQUEST_ID_HEADER]) ?? randomUUID();

		setRequestContext(request, createAnonymousRequestContext(requestId));
		response.setHeader(REQUEST_ID_HEADER, requestId);

		next();
	}
}
