import type { INestApplication } from '@nestjs/common';

import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ERROR_CODES } from './http/error-codes';
import { HttpExceptionFilter } from './http/http-exception.filter';
import { REQUEST_ID_HEADER } from './request-context/request-context';
import { SEEDED_CUSTOMER_IDS } from './request-context/seeded-customer-ids';

type SupertestTarget = Parameters<typeof request>[0];

function isSupertestTarget(value: unknown): value is SupertestTarget {
	return (typeof value === 'function') || (typeof value === 'object' && value !== null);
}

describe('backend integration behavior', () => {
	let app: INestApplication;
	const getHttpServer = (): SupertestTarget => {
		const httpServer: unknown = app.getHttpServer();

		if (!isSupertestTarget(httpServer)) {
			throw new Error('Nest application did not expose a valid HTTP server');
		}

		return httpServer;
	};

	beforeAll(async () => {
		process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/mwa_backend';

		const { AppModule } = await import('./app.module');

		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = testingModule.createNestApplication();
		app.useGlobalFilters(new HttpExceptionFilter());

		await app.init();
	});

	afterAll(async () => {
		if (app !== undefined) {
			await app.close();
		}
	});

	it('returns the health contract through the public HTTP interface', async () => {
		const response = await request(getHttpServer()).get('/health');

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			success: true,
			data: {
				status: 'ok',
			},
		});
	});

	it('returns prometheus metrics text after requests are recorded', async () => {
		await request(getHttpServer()).get('/health');

		const response = await request(getHttpServer()).get('/metrics');

		expect(response.status).toBe(200);
		expect(response.headers['content-type'] ?? '').toMatch(/text\/plain/);
		expect(response.text).toMatch(/mwa_http_requests_total/);
		expect(response.text).toMatch(/user_role="anonymous"/);
	});

	it('keeps public catalog context routes accessible without x-customer-id', async () => {
		const response = await request(getHttpServer()).get('/api/catalog/context-check');

		expect(response.status).toBe(200);
		expect(response.headers[REQUEST_ID_HEADER]).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		);
		expect(response.body).toEqual({
			success: true,
			data: {
				access: 'public-read',
				context: {
					requestId: response.headers[REQUEST_ID_HEADER],
					userRole: 'anonymous',
				},
			},
		});
	});

	it('rejects buyer write routes when x-customer-id is missing', async () => {
		const response = await request(getHttpServer()).post('/api/cart/items').send({
			variantId: 'var-notebook-std',
			quantity: 1,
		});

		expect(response.status).toBe(401);
		expect(response.headers[REQUEST_ID_HEADER]).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		);
		expect(response.body).toMatchObject({
			success: false,
			error: {
				code: ERROR_CODES.UNAUTHORIZED_CUSTOMER,
			},
		});
	});

	it('rejects buyer write routes when x-customer-id is unknown', async () => {
		const response = await request(getHttpServer())
			.post('/api/cart/items')
			.set('x-customer-id', '99999999-9999-4999-8999-999999999999')
			.send({
				variantId: 'var-notebook-std',
				quantity: 1,
			});

		expect(response.status).toBe(401);
		expect(response.body).toMatchObject({
			success: false,
			error: {
				code: ERROR_CODES.UNAUTHORIZED_CUSTOMER,
			},
		});
	});

	it('accepts seeded buyer identities and preserves an inbound request id', async () => {
		const response = await request(getHttpServer())
			.post('/api/cart/items')
			.set('x-customer-id', SEEDED_CUSTOMER_IDS[0])
			.set(REQUEST_ID_HEADER, 'request-contract-001')
			.send({
				variantId: 'var-notebook-std',
				quantity: 1,
			});

		expect(response.status).toBe(201);
		expect(response.headers[REQUEST_ID_HEADER]).toBe('request-contract-001');
		expect(response.body).toEqual({
			success: true,
			data: {
				accepted: true,
				context: {
					requestId: 'request-contract-001',
					userRole: 'buyer',
					customerId: SEEDED_CUSTOMER_IDS[0],
				},
			},
		});
	});

	it('applies pagination defaults through the public contract route', async () => {
		const response = await request(getHttpServer()).get('/contract/pagination');

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			success: true,
			data: {
				page: 1,
				limit: 20,
			},
			meta: {
				pagination: {
					page: 1,
					limit: 20,
					total: 0,
					totalPages: 1,
				},
			},
		});
	});

	it('returns the fixed validation envelope on invalid pagination query', async () => {
		const response = await request(getHttpServer()).get('/contract/pagination?page=0');

		expect(response.status).toBe(400);
		expect(response.body).toMatchObject({
			success: false,
			error: {
				code: ERROR_CODES.VALIDATION_ERROR,
			},
		});
	});
});
