import type { INestApplication } from '@nestjs/common';

import { execFileSync } from 'node:child_process';

import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ERROR_CODES } from '../http/error-codes';
import { HttpExceptionFilter } from '../http/http-exception.filter';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://mwa:mwa@localhost:5432/mwa?schema=public';
const BUYER_ONE = '11111111-1111-4111-8111-111111111111';
const BUYER_TWO = '11111111-1111-4111-8111-111111111112';
const ORDER_SUCCESS = '55555555-5555-4555-8555-555555555551';
const ORDER_FAILURE = '55555555-5555-4555-8555-555555555552';

function resetDatabase(): void {
	execFileSync('npm', ['run', 'db:reset:test'], {
		cwd: process.cwd(),
		env: {
			...process.env,
			DATABASE_URL,
		},
		stdio: 'pipe',
	})
}

describe('payment integration behavior', () => {
	let app: INestApplication;

	beforeEach(async () => {
		resetDatabase();
		process.env.DATABASE_URL = DATABASE_URL;

		const { AppModule } = await import('../app.module');
		const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

		app = testingModule.createNestApplication();
		app.useGlobalFilters(new HttpExceptionFilter());
		await app.init();
	});

	afterEach(async () => {
		if (app !== undefined) {
			await app.close();
		}
	});

	it('creates a successful payment attempt and returns 201', async () => {
		const response = await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
			.set('x-customer-id', BUYER_ONE)
			.send({ requestKey: 'req-success-001', outcome: 'success' });

		expect(response.status).toBe(201);
		expect(response.body.data.attempt).toMatchObject({
			order_id: ORDER_SUCCESS,
			request_key: 'req-success-001',
			status: 'succeeded',
			amount: '29800.00',
			failure_code: null,
		});

		const orderAfter = await request(app.getHttpServer())
			.get(`/api/orders/${ORDER_SUCCESS}`)
			.set('x-customer-id', BUYER_ONE);

		expect(orderAfter.status).toBe(200);
		expect(orderAfter.body.data.order.status).toBe('paid');
	});

	it('creates a failed payment attempt and requires failureCode', async () => {
		const missingFailureCode = await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_FAILURE}/payment-attempts`)
			.set('x-customer-id', BUYER_TWO)
			.send({ requestKey: 'req-fail-001', outcome: 'fail' });

		expect(missingFailureCode.status).toBe(400);
		expect(missingFailureCode.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);

		const failed = await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_FAILURE}/payment-attempts`)
			.set('x-customer-id', BUYER_TWO)
			.send({ requestKey: 'req-fail-001', outcome: 'fail', failureCode: 'CARD_DECLINED' });

		expect(failed.status).toBe(201);
		expect(failed.body.data.attempt).toMatchObject({
			order_id: ORDER_FAILURE,
			request_key: 'req-fail-001',
			status: 'failed',
			failure_code: 'CARD_DECLINED',
		});

		const orderAfter = await request(app.getHttpServer())
			.get(`/api/orders/${ORDER_FAILURE}`)
			.set('x-customer-id', BUYER_TWO);

		expect(orderAfter.status).toBe(200);
		expect(orderAfter.body.data.order.status).toBe('payment_failed');
	});

	it('replays the same requestKey without creating a duplicate row', async () => {
		const created = await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
			.set('x-customer-id', BUYER_ONE)
			.send({ requestKey: 'req-success-001', outcome: 'success' });

		expect(created.status).toBe(201);

		const replayed = await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
			.set('x-customer-id', BUYER_ONE)
			.send({ requestKey: 'req-success-001', outcome: 'success' });

		expect(replayed.status).toBe(200);
		expect(replayed.body.data.attempt.payment_attempt_id).toBe(created.body.data.attempt.payment_attempt_id);

		const attempts = await request(app.getHttpServer())
			.get(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
			.set('x-customer-id', BUYER_ONE);

		expect(attempts.status).toBe(200);
		expect(attempts.body.data.attempts.filter((attempt: { request_key: string }) => attempt.request_key === 'req-success-001')).toHaveLength(1);
	});

	it('rejects conflicting replay and keeps a paid order in paid state', async () => {
		const created = await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
			.set('x-customer-id', BUYER_ONE)
			.send({ requestKey: 'req-success-001', outcome: 'success' });

		expect(created.status).toBe(201);

		const conflictingReplay = await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
			.set('x-customer-id', BUYER_ONE)
			.send({ requestKey: 'req-success-001', outcome: 'fail', failureCode: 'CARD_DECLINED' });

		expect(conflictingReplay.status).toBe(409);
		expect(conflictingReplay.body.error.code).toBe(ERROR_CODES.STATE_CONFLICT);

		const orderAfter = await request(app.getHttpServer())
			.get(`/api/orders/${ORDER_SUCCESS}`)
			.set('x-customer-id', BUYER_ONE);

		expect(orderAfter.status).toBe(200);
		expect(orderAfter.body.data.order.status).toBe('paid');
	});

	it('rejects a new requestKey after the order is already paid', async () => {
		const created = await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
			.set('x-customer-id', BUYER_ONE)
			.send({ requestKey: 'req-success-001', outcome: 'success' });

		expect(created.status).toBe(201);

		const duplicateChargeAttempt = await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
			.set('x-customer-id', BUYER_ONE)
			.send({ requestKey: 'req-success-002', outcome: 'success' });

		expect(duplicateChargeAttempt.status).toBe(409);
		expect(duplicateChargeAttempt.body.error.code).toBe(ERROR_CODES.STATE_CONFLICT);

		const attempts = await request(app.getHttpServer())
			.get(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
			.set('x-customer-id', BUYER_ONE);

		expect(attempts.status).toBe(200);
		expect(attempts.body.data.attempts.filter((attempt: { request_key: string }) => attempt.request_key.startsWith('req-success-'))).toHaveLength(1);
	});

	it('keeps duplicate payment request keys idempotent under concurrent replay', async () => {
		const [first, second] = await Promise.all([
			request(app.getHttpServer())
				.post(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
				.set('x-customer-id', BUYER_ONE)
				.send({ requestKey: 'req-concurrent-001', outcome: 'success' }),
			request(app.getHttpServer())
				.post(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
				.set('x-customer-id', BUYER_ONE)
				.send({ requestKey: 'req-concurrent-001', outcome: 'success' }),
		]);

		expect([first.status, second.status].sort()).toEqual([200, 201]);
		const attempts = await request(app.getHttpServer())
			.get(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
			.set('x-customer-id', BUYER_ONE);

		expect(attempts.body.data.attempts.filter((attempt: { request_key: string }) => attempt.request_key === 'req-concurrent-001')).toHaveLength(1);
	});

	it('returns 404 when another customer targets the order', async () => {
		const response = await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
			.set('x-customer-id', BUYER_TWO)
			.send({ requestKey: 'req-cross-001', outcome: 'success' });

		expect(response.status).toBe(404);
		expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
	});
});
