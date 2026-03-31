import type { INestApplication } from '@nestjs/common';

import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ERROR_CODES } from './http/error-codes';
import { HttpExceptionFilter } from './http/http-exception.filter';

describe('backend integration behavior', () => {
	let app: INestApplication;
	const databaseUrl = 'postgresql://mwa:mwa@localhost:5432/mwa?schema=public';

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;

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
		const response = await request(app.getHttpServer()).get('/health');

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			success: true,
			data: {
				status: 'ok',
			},
		});
	});

	it('returns prometheus metrics text after requests are recorded', async () => {
		await request(app.getHttpServer()).get('/health');

		const response = await request(app.getHttpServer()).get('/metrics');

		expect(response.status).toBe(200);
		expect(response.headers['content-type'] ?? '').toMatch(/text\/plain/);
		expect(response.text).toMatch(/mwa_http_requests_total/);
	});

	it('applies pagination defaults through the public contract route', async () => {
		const response = await request(app.getHttpServer()).get('/contract/pagination');

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
		const response = await request(app.getHttpServer()).get('/contract/pagination?page=0');

		expect(response.status).toBe(400);
		expect(response.body.success).toBe(false);
		expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
	});
});
