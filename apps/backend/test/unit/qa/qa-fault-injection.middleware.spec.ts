import type { NextFunction, Request, Response } from 'express';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { QaFaultInjectionMiddleware } from '../../../src/qa/qa-fault-injection.middleware';

function createResponse(): Response & { body?: unknown; statusCodeValue?: number } {
	const response = {
		locals: {},
		statusCodeValue: undefined,
		body: undefined,
		status(statusCode: number) {
			this.statusCodeValue = statusCode;
			return this;
		},
		json(body: unknown) {
			this.body = body;
			return this;
		},
	} as Response & { body?: unknown; statusCodeValue?: number };

	return response;
}

function createRequest(path: string, headers: Request['headers'] = {}): Request {
	return {
		path,
		headers,
	} as Request;
}

describe('QaFaultInjectionMiddleware', () => {
	const originalEnabled = process.env.QA_FAULT_INJECTION_ENABLED;

	afterEach(() => {
		process.env.QA_FAULT_INJECTION_ENABLED = originalEnabled;
		vi.useRealTimers();
	});

	it('passes through when QA fault injection is disabled', () => {
		process.env.QA_FAULT_INJECTION_ENABLED = 'false';
		const middleware = new QaFaultInjectionMiddleware();
		const response = createResponse();
		const next = vi.fn() as NextFunction;

		middleware.use(createRequest('/api/search', { 'x-mwa-fault': 'error' }), response, next);

		expect(next).toHaveBeenCalledOnce();
		expect(response.statusCodeValue).toBeUndefined();
	});

	it('returns a structured 500 for an enabled error fault on an allowed path', () => {
		process.env.QA_FAULT_INJECTION_ENABLED = 'true';
		const middleware = new QaFaultInjectionMiddleware();
		const response = createResponse();
		const next = vi.fn() as NextFunction;

		middleware.use(createRequest('/api/search', { 'x-mwa-fault': 'error' }), response, next);

		expect(next).not.toHaveBeenCalled();
		expect(response.statusCodeValue).toBe(500);
		expect(response.body).toMatchObject({
			success: false,
			error: { code: 'INTERNAL_SERVER_ERROR' },
		});
	});

	it('delays allowed requests before continuing', async () => {
		vi.useFakeTimers();
		process.env.QA_FAULT_INJECTION_ENABLED = 'true';
		const middleware = new QaFaultInjectionMiddleware();
		const response = createResponse();
		const next = vi.fn() as NextFunction;

		middleware.use(
			createRequest('/api/search', {
				'x-mwa-fault': 'delay',
				'x-mwa-fault-delay-ms': '25',
			}),
			response,
			next,
		);

		expect(next).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(25);
		expect(next).toHaveBeenCalledOnce();
		expect(response.statusCodeValue).toBeUndefined();
	});
});
